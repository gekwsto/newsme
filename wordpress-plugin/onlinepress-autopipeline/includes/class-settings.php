<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Single source of truth for plugin settings. Stored as one array option so
 * activation/uninstall and defaults stay simple and atomic.
 */
class OP_AutoPipeline_Settings {

	const SITE_ID = 'onlinepress';

	public static function defaults() {
		return array(
			'api_url'         => '',
			'api_key'         => '',
			'enabled'         => false,
			'limit'           => 10,
			'import_status'   => 'draft', // draft|publish
			'schedule'        => 'manual', // manual|op_autopipeline_15min|op_autopipeline_30min|hourly
			'default_author'  => get_current_user_id(),
			'create_missing_categories' => true,
			'create_missing_tags'       => true,
		);
	}

	public static function maybe_set_defaults() {
		if ( false === get_option( OP_AUTOPIPELINE_OPTION_SETTINGS, false ) ) {
			add_option( OP_AUTOPIPELINE_OPTION_SETTINGS, self::defaults() );
		}
	}

	public static function all() {
		$stored = get_option( OP_AUTOPIPELINE_OPTION_SETTINGS, array() );
		return wp_parse_args( is_array( $stored ) ? $stored : array(), self::defaults() );
	}

	public static function get( $key, $default = null ) {
		$all = self::all();
		return array_key_exists( $key, $all ) ? $all[ $key ] : $default;
	}

	public static function update( array $partial ) {
		$sanitized = self::sanitize( wp_parse_args( $partial, self::all() ) );
		update_option( OP_AUTOPIPELINE_OPTION_SETTINGS, $sanitized );
		return $sanitized;
	}

	/**
	 * Sanitizes a full settings array (used by register_setting's callback and by update()).
	 */
	public static function sanitize( $input ) {
		$defaults = self::defaults();
		$out      = array();

		$out['api_url'] = isset( $input['api_url'] ) ? esc_url_raw( trim( $input['api_url'] ) ) : $defaults['api_url'];

		// Only overwrite the stored key if a non-empty value was submitted —
		// lets the settings form redisplay without ever echoing the secret back.
		if ( ! empty( $input['api_key'] ) ) {
			$out['api_key'] = sanitize_text_field( $input['api_key'] );
		} else {
			$out['api_key'] = self::get( 'api_key', '' );
		}

		$out['enabled'] = ! empty( $input['enabled'] );

		$limit = isset( $input['limit'] ) ? absint( $input['limit'] ) : $defaults['limit'];
		$out['limit'] = in_array( $limit, array( 1, 5, 10, 20 ), true ) ? $limit : $defaults['limit'];

		$status = isset( $input['import_status'] ) ? sanitize_key( $input['import_status'] ) : $defaults['import_status'];
		$out['import_status'] = in_array( $status, array( 'draft', 'publish' ), true ) ? $status : 'draft';

		$allowed_schedules = array( 'manual', 'op_autopipeline_15min', 'op_autopipeline_30min', 'hourly' );
		$schedule = isset( $input['schedule'] ) ? sanitize_key( $input['schedule'] ) : $defaults['schedule'];
		$out['schedule'] = in_array( $schedule, $allowed_schedules, true ) ? $schedule : 'manual';

		$out['default_author'] = isset( $input['default_author'] ) ? absint( $input['default_author'] ) : $defaults['default_author'];
		if ( ! get_userdata( $out['default_author'] ) ) {
			$out['default_author'] = $defaults['default_author'];
		}

		$out['create_missing_categories'] = ! empty( $input['create_missing_categories'] );
		$out['create_missing_tags']       = ! empty( $input['create_missing_tags'] );

		return $out;
	}
}
