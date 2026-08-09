<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Applies SEO title/description from NewsMe to whatever SEO plugin is
 * actually active on this WordPress install. Never assumes Yoast — detects
 * Yoast SEO or Rank Math, and falls back to plain postmeta (still useful
 * for later use / a future SEO plugin) if neither is present. Missing SEO
 * plugin is not a fatal condition for the import.
 */
class OP_AutoPipeline_Seo {

	const PROVIDER_YOAST     = 'yoast';
	const PROVIDER_RANK_MATH = 'rank_math';
	const PROVIDER_NONE      = 'none';

	public static function detect_provider() {
		if ( defined( 'WPSEO_VERSION' ) ) {
			return self::PROVIDER_YOAST;
		}
		if ( class_exists( 'RankMath' ) || defined( 'RANK_MATH_VERSION' ) ) {
			return self::PROVIDER_RANK_MATH;
		}
		return self::PROVIDER_NONE;
	}

	public static function apply( $post_id, $seo_title, $seo_description ) {
		$seo_title       = sanitize_text_field( (string) $seo_title );
		$seo_description = sanitize_text_field( (string) $seo_description );

		switch ( self::detect_provider() ) {
			case self::PROVIDER_YOAST:
				update_post_meta( $post_id, '_yoast_wpseo_title', $seo_title );
				update_post_meta( $post_id, '_yoast_wpseo_metadesc', $seo_description );
				break;

			case self::PROVIDER_RANK_MATH:
				update_post_meta( $post_id, 'rank_math_title', $seo_title );
				update_post_meta( $post_id, 'rank_math_description', $seo_description );
				break;

			default:
				// No SEO plugin detected — keep the values as our own postmeta
				// so they are not lost and can be reused if a plugin is added later.
				update_post_meta( $post_id, '_onlinepress_autopipeline_seo_title', $seo_title );
				update_post_meta( $post_id, '_onlinepress_autopipeline_seo_description', $seo_description );
				break;
		}
	}
}
