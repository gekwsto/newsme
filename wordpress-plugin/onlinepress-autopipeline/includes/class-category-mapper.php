<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Resolves NewsMe category/tag slugs to WordPress term IDs. NewsMe and
 * WordPress never share database IDs across systems, so matching is always
 * done by slug (categories) or name (tags), never by numeric ID.
 */
class OP_AutoPipeline_Category_Mapper {

	/**
	 * @param string $slug NewsMe category slug (e.g. "politiki").
	 * @param string $name NewsMe category display name (e.g. "Πολιτική"), used only if the term must be created.
	 * @return int|WP_Error WordPress term_id, or WP_Error if missing and creation is disabled.
	 */
	public static function resolve_category( $slug, $name ) {
		$slug = sanitize_title( $slug );
		if ( '' === $slug ) {
			$slug = sanitize_title( $name );
		}

		$term = get_term_by( 'slug', $slug, 'category' );
		if ( $term instanceof WP_Term ) {
			return (int) $term->term_id;
		}

		if ( ! OP_AutoPipeline_Settings::get( 'create_missing_categories', true ) ) {
			return new WP_Error( 'op_autopipeline_category_missing', sprintf( 'Category "%s" does not exist and auto-creation is disabled.', $slug ) );
		}

		$created = wp_insert_term( $name ? $name : $slug, 'category', array( 'slug' => $slug ) );
		if ( is_wp_error( $created ) ) {
			// Race condition: another process created it between our lookup and insert.
			$existing = get_term_by( 'slug', $slug, 'category' );
			if ( $existing instanceof WP_Term ) {
				return (int) $existing->term_id;
			}
			return $created;
		}

		return (int) $created['term_id'];
	}

	/**
	 * @param string[] $tag_names
	 * @return int[] Term IDs (any that failed to resolve/create are skipped, not fatal).
	 */
	public static function resolve_tags( array $tag_names ) {
		$term_ids            = array();
		$create_missing_tags = OP_AutoPipeline_Settings::get( 'create_missing_tags', true );

		foreach ( $tag_names as $tag_name ) {
			$tag_name = trim( (string) $tag_name );
			if ( '' === $tag_name ) {
				continue;
			}

			$term = get_term_by( 'name', $tag_name, 'post_tag' );
			if ( $term instanceof WP_Term ) {
				$term_ids[] = (int) $term->term_id;
				continue;
			}

			if ( ! $create_missing_tags ) {
				continue;
			}

			$created = wp_insert_term( $tag_name, 'post_tag' );
			if ( is_wp_error( $created ) ) {
				$existing = get_term_by( 'name', $tag_name, 'post_tag' );
				if ( $existing instanceof WP_Term ) {
					$term_ids[] = (int) $existing->term_id;
				}
				continue;
			}

			$term_ids[] = (int) $created['term_id'];
		}

		return $term_ids;
	}
}
