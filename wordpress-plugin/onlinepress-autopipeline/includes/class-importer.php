<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Turns normalized NewsMe articles into WordPress posts.
 *
 * NewsMe already did RSS discovery, extraction, filtering, AI rewriting,
 * categorization and image selection — this class only maps that result
 * onto wp_insert_post() and friends. Each article is isolated in its own
 * try/catch so one bad record cannot fail the whole batch.
 */
class OP_AutoPipeline_Importer {

	const META_EXTERNAL_ID  = '_newsme_article_id';
	const META_SOURCE_HASH  = '_newsme_source_hash';
	const META_IMPORTED_AT  = '_newsme_imported_at';

	/**
	 * @param array $articles Normalized articles as returned by NewsMe.
	 * @return array { results: [externalId => result], stats: {...} }
	 */
	public function import_batch( array $articles, $publish_status, $author_id ) {
		$results = array();
		$stats   = array(
			'imported'       => 0,
			'published'      => 0,
			'skipped'        => 0,
			'failed'         => 0,
			'image_failures' => 0,
		);

		foreach ( $articles as $article ) {
			$external_id = isset( $article['externalId'] ) ? (string) $article['externalId'] : '';

			try {
				$result = $this->import_one( $article, $publish_status, $author_id );
			} catch ( \Throwable $e ) {
				error_log( '[onlinepress-autopipeline] import_exception external_id=' . $external_id . ' message=' . $e->getMessage() );
				$result = array( 'status' => 'failed', 'reason' => 'exception: ' . $e->getMessage() );
			}

			if ( '' === $external_id ) {
				$external_id = 'unknown-' . wp_generate_uuid4();
			}

			$results[ $external_id ] = $result;

			switch ( $result['status'] ) {
				case 'imported':
					$stats['imported']++;
					if ( ! empty( $result['published'] ) ) {
						$stats['published']++;
					}
					break;
				case 'skipped':
					$stats['skipped']++;
					break;
				case 'failed':
					$stats['failed']++;
					break;
			}
			if ( ! empty( $result['image_failed'] ) ) {
				$stats['image_failures']++;
			}
		}

		return array( 'results' => $results, 'stats' => $stats );
	}

	/**
	 * @return array { status: imported|skipped|failed, post_id?, url?, published?, image_failed?, reason? }
	 */
	private function import_one( array $article, $publish_status, $author_id ) {
		$validation_error = $this->validate( $article );
		if ( $validation_error ) {
			return array( 'status' => 'failed', 'reason' => $validation_error );
		}

		$external_id = (string) $article['externalId'];

		// Duplicate protection: idempotent no matter how many times NewsMe
		// resends the same article (retry after timeout, redelivery window, etc).
		$existing = $this->find_existing_post( $external_id );
		if ( $existing ) {
			return array(
				'status'  => 'skipped',
				'reason'  => 'duplicate',
				'post_id' => $existing,
				'url'     => get_permalink( $existing ),
			);
		}

		$category_result = OP_AutoPipeline_Category_Mapper::resolve_category(
			isset( $article['category']['slug'] ) ? $article['category']['slug'] : '',
			isset( $article['category']['name'] ) ? $article['category']['name'] : ''
		);
		if ( is_wp_error( $category_result ) ) {
			return array( 'status' => 'failed', 'reason' => 'category: ' . $category_result->get_error_message() );
		}

		$tag_ids = OP_AutoPipeline_Category_Mapper::resolve_tags( isset( $article['tags'] ) ? (array) $article['tags'] : array() );

		$postarr = array(
			'post_title'   => sanitize_text_field( $article['title'] ),
			'post_name'    => sanitize_title( $article['slug'] ),
			'post_content' => wp_kses_post( $article['content'] ),
			'post_excerpt' => sanitize_textarea_field( isset( $article['excerpt'] ) ? $article['excerpt'] : '' ),
			'post_status'  => 'publish' === $publish_status ? 'publish' : 'draft',
			'post_type'    => 'post',
			'post_author'  => $author_id,
			'post_category'=> array( $category_result ),
			'meta_input'   => array(
				self::META_EXTERNAL_ID => $external_id,
				self::META_SOURCE_HASH => md5( $external_id . '|' . $article['slug'] ),
				self::META_IMPORTED_AT => current_time( 'mysql' ),
			),
		);

		$post_id = wp_insert_post( $postarr, true );
		if ( is_wp_error( $post_id ) ) {
			return array( 'status' => 'failed', 'reason' => 'wp_insert_post: ' . $post_id->get_error_message() );
		}

		if ( ! empty( $tag_ids ) ) {
			wp_set_post_terms( $post_id, $tag_ids, 'post_tag' );
		}

		$image_failed = false;
		if ( ! empty( $article['featuredImage'] ) && is_array( $article['featuredImage'] ) ) {
			$image_result = OP_AutoPipeline_Image_Handler::attach_featured_image( $post_id, $article['featuredImage'] );
			if ( is_wp_error( $image_result ) ) {
				$image_failed = true;
				error_log( '[onlinepress-autopipeline] image_failed post_id=' . $post_id . ' reason=' . $image_result->get_error_message() );
				// Intentionally not fatal — the article import still succeeds.
			}
		}

		if ( ! empty( $article['seo'] ) && is_array( $article['seo'] ) ) {
			OP_AutoPipeline_Seo::apply(
				$post_id,
				isset( $article['seo']['title'] ) ? $article['seo']['title'] : $article['title'],
				isset( $article['seo']['description'] ) ? $article['seo']['description'] : ''
			);
		}

		return array(
			'status'       => 'imported',
			'post_id'      => $post_id,
			'url'          => get_permalink( $post_id ),
			'published'    => 'publish' === $publish_status,
			'image_failed' => $image_failed,
		);
	}

	private function validate( array $article ) {
		foreach ( array( 'externalId', 'title', 'slug', 'content' ) as $field ) {
			if ( empty( $article[ $field ] ) ) {
				return 'missing required field: ' . $field;
			}
		}
		return null;
	}

	/**
	 * @return int|null Existing post ID for this NewsMe external ID, if any.
	 */
	private function find_existing_post( $external_id ) {
		$posts = get_posts(
			array(
				'post_type'      => 'post',
				'post_status'    => 'any',
				'meta_key'       => self::META_EXTERNAL_ID,
				'meta_value'     => $external_id,
				'posts_per_page' => 1,
				'fields'         => 'ids',
				'no_found_rows'  => true,
			)
		);
		return ! empty( $posts ) ? (int) $posts[0] : null;
	}
}
