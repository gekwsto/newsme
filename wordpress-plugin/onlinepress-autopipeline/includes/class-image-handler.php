<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Downloads a NewsMe-provided featured image into the Media Library and
 * attaches it to a post. Failures here must never fail the whole article
 * import — callers treat a WP_Error as "continue without a featured image".
 */
class OP_AutoPipeline_Image_Handler {

	/**
	 * @param array $image { url, alt, caption } — as returned by NewsMe.
	 * @return int|WP_Error Attachment ID on success.
	 */
	public static function attach_featured_image( $post_id, array $image ) {
		if ( empty( $image['url'] ) || ! wp_http_validate_url( $image['url'] ) ) {
			return new WP_Error( 'op_autopipeline_invalid_image_url', 'Missing or invalid featured image URL.' );
		}

		if ( ! function_exists( 'media_sideload_image' ) ) {
			require_once ABSPATH . 'wp-admin/includes/media.php';
			require_once ABSPATH . 'wp-admin/includes/file.php';
			require_once ABSPATH . 'wp-admin/includes/image.php';
		}

		$description   = isset( $image['alt'] ) ? sanitize_text_field( $image['alt'] ) : '';
		$attachment_id = media_sideload_image( esc_url_raw( $image['url'] ), $post_id, $description, 'id' );

		if ( is_wp_error( $attachment_id ) ) {
			return $attachment_id;
		}

		$mime_type = get_post_mime_type( $attachment_id );
		if ( ! $mime_type || 0 !== strpos( $mime_type, 'image/' ) ) {
			wp_delete_attachment( $attachment_id, true );
			return new WP_Error( 'op_autopipeline_invalid_mime', 'Downloaded file was not a valid image.' );
		}

		if ( ! empty( $image['alt'] ) ) {
			update_post_meta( $attachment_id, '_wp_attachment_image_alt', sanitize_text_field( $image['alt'] ) );
		}

		if ( ! empty( $image['caption'] ) ) {
			wp_update_post(
				array(
					'ID'           => $attachment_id,
					'post_excerpt' => sanitize_text_field( $image['caption'] ),
				)
			);
		}

		$set = set_post_thumbnail( $post_id, $attachment_id );
		if ( ! $set ) {
			return new WP_Error( 'op_autopipeline_thumbnail_failed', 'Image was downloaded but could not be set as the featured image.' );
		}

		return $attachment_id;
	}
}
