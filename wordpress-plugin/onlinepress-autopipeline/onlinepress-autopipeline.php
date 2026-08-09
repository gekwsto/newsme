<?php
/**
 * Plugin Name:       OnlinePress AutoPipeline
 * Plugin URI:        https://onlinepress.gr
 * Description:       Pulls fully processed, ready-to-publish articles from the NewsMe Article Processing Engine and imports them into WordPress as posts (categories, tags, featured image, SEO metadata). NewsMe stays the source of truth for RSS discovery, AI rewriting, and image selection — this plugin only imports and publishes.
 * Version:           1.0.0
 * Requires at least: 6.0
 * Requires PHP:      7.4
 * Author:            OnlinePress
 * Text Domain:       onlinepress-autopipeline
 * License:           GPL v2 or later
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit; // Disallow direct access.
}

define( 'OP_AUTOPIPELINE_VERSION', '1.0.0' );
define( 'OP_AUTOPIPELINE_FILE', __FILE__ );
define( 'OP_AUTOPIPELINE_DIR', plugin_dir_path( __FILE__ ) );
define( 'OP_AUTOPIPELINE_URL', plugin_dir_url( __FILE__ ) );
define( 'OP_AUTOPIPELINE_CRON_HOOK', 'onlinepress_autopipeline_run_event' );
define( 'OP_AUTOPIPELINE_LOCK_KEY', 'onlinepress_autopipeline_lock' );
define( 'OP_AUTOPIPELINE_OPTION_SETTINGS', 'onlinepress_autopipeline_settings' );
define( 'OP_AUTOPIPELINE_OPTION_RUNS', 'onlinepress_autopipeline_runs' );
define( 'OP_AUTOPIPELINE_OPTION_STATS', 'onlinepress_autopipeline_stats' );

require_once OP_AUTOPIPELINE_DIR . 'includes/class-settings.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-logger.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-api-client.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-category-mapper.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-image-handler.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-seo.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-importer.php';
require_once OP_AUTOPIPELINE_DIR . 'includes/class-scheduler.php';

if ( is_admin() ) {
	require_once OP_AUTOPIPELINE_DIR . 'includes/class-admin.php';
}

/**
 * Registers the plugin's custom cron intervals (WordPress only ships
 * hourly/twicedaily/daily by default).
 */
function onlinepress_autopipeline_cron_schedules( $schedules ) {
	$schedules['op_autopipeline_15min'] = array(
		'interval' => 15 * MINUTE_IN_SECONDS,
		'display'  => __( 'Every 15 Minutes', 'onlinepress-autopipeline' ),
	);
	$schedules['op_autopipeline_30min'] = array(
		'interval' => 30 * MINUTE_IN_SECONDS,
		'display'  => __( 'Every 30 Minutes', 'onlinepress-autopipeline' ),
	);
	return $schedules;
}
add_filter( 'cron_schedules', 'onlinepress_autopipeline_cron_schedules' );

// The cron hook always runs a normal (non-forced) poll; the manual "Run Now"
// button in wp-admin is wired separately (see class-admin.php) and forces a
// fresh NewsMe generation cycle.
add_action( OP_AUTOPIPELINE_CRON_HOOK, array( 'OP_AutoPipeline_Scheduler', 'run_scheduled_pipeline' ) );

function onlinepress_autopipeline_activate() {
	OP_AutoPipeline_Settings::maybe_set_defaults();
	OP_AutoPipeline_Scheduler::reschedule( OP_AutoPipeline_Settings::get( 'schedule', 'manual' ) );
}
register_activation_hook( OP_AUTOPIPELINE_FILE, 'onlinepress_autopipeline_activate' );

function onlinepress_autopipeline_deactivate() {
	OP_AutoPipeline_Scheduler::unschedule();
	delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
}
register_deactivation_hook( OP_AUTOPIPELINE_FILE, 'onlinepress_autopipeline_deactivate' );

if ( ! function_exists( 'onlinepress_autopipeline_sleep' ) ) {
	/**
	 * Thin wrapper around sleep() so the poll loop in class-scheduler.php can
	 * be unit-tested without a test run actually pausing for real seconds —
	 * tests/wp-stubs.php pre-defines a no-op version of this function, which
	 * (being loaded first) wins over this real one via the function_exists guard.
	 */
	function onlinepress_autopipeline_sleep( $seconds ) {
		sleep( $seconds );
	}
}

function onlinepress_autopipeline_load_textdomain() {
	load_plugin_textdomain( 'onlinepress-autopipeline', false, dirname( plugin_basename( OP_AUTOPIPELINE_FILE ) ) . '/languages' );
}
add_action( 'plugins_loaded', 'onlinepress_autopipeline_load_textdomain' );
