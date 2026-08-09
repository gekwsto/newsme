<?php
/**
 * Uninstall cleanup. Removes plugin settings/run-history options and the
 * scheduled cron event. Deliberately does NOT delete any imported posts,
 * categories, tags, or media — those are real site content, not plugin state.
 */

if ( ! defined( 'WP_UNINSTALL_PLUGIN' ) ) {
	exit;
}

delete_option( 'onlinepress_autopipeline_settings' );
delete_option( 'onlinepress_autopipeline_runs' );
delete_option( 'onlinepress_autopipeline_stats' );
delete_transient( 'onlinepress_autopipeline_lock' );

$timestamp = wp_next_scheduled( 'onlinepress_autopipeline_run_event' );
while ( $timestamp ) {
	wp_unschedule_event( $timestamp, 'onlinepress_autopipeline_run_event' );
	$timestamp = wp_next_scheduled( 'onlinepress_autopipeline_run_event' );
}
