<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class OP_AutoPipeline_Admin {

	const PAGE_SLUG    = 'onlinepress-autopipeline';
	const NONCE_ACTION = 'onlinepress_autopipeline_run_now';

	public static function init() {
		$instance = new self();
		add_action( 'admin_menu', array( $instance, 'register_menu' ) );
		add_action( 'admin_init', array( $instance, 'register_settings' ) );
		add_action( 'admin_enqueue_scripts', array( $instance, 'enqueue_assets' ) );
		add_action( 'wp_ajax_onlinepress_autopipeline_run_now', array( $instance, 'handle_run_now' ) );
		add_action( 'update_option_' . OP_AUTOPIPELINE_OPTION_SETTINGS, array( $instance, 'on_settings_updated' ), 10, 2 );
	}

	public function register_menu() {
		add_menu_page(
			__( 'OnlinePress AutoPipeline', 'onlinepress-autopipeline' ),
			__( 'OnlinePress AutoPipeline', 'onlinepress-autopipeline' ),
			'manage_options',
			self::PAGE_SLUG,
			array( $this, 'render_page' ),
			'dashicons-rss'
		);
	}

	public function register_settings() {
		register_setting(
			'onlinepress_autopipeline_settings_group',
			OP_AUTOPIPELINE_OPTION_SETTINGS,
			array( 'sanitize_callback' => array( 'OP_AutoPipeline_Settings', 'sanitize' ) )
		);
	}

	public function on_settings_updated( $old_value, $new_value ) {
		$old_schedule = is_array( $old_value ) && isset( $old_value['schedule'] ) ? $old_value['schedule'] : null;
		$new_schedule = is_array( $new_value ) && isset( $new_value['schedule'] ) ? $new_value['schedule'] : 'manual';
		if ( $old_schedule !== $new_schedule ) {
			OP_AutoPipeline_Scheduler::reschedule( $new_schedule );
		}
	}

	public function enqueue_assets( $hook ) {
		if ( 'toplevel_page_' . self::PAGE_SLUG !== $hook ) {
			return;
		}
		wp_enqueue_style( 'onlinepress-autopipeline-admin', OP_AUTOPIPELINE_URL . 'assets/admin.css', array(), OP_AUTOPIPELINE_VERSION );
		wp_enqueue_script( 'onlinepress-autopipeline-admin', OP_AUTOPIPELINE_URL . 'assets/admin.js', array( 'jquery' ), OP_AUTOPIPELINE_VERSION, true );
		wp_localize_script(
			'onlinepress-autopipeline-admin',
			'OPAutoPipeline',
			array(
				'ajaxUrl' => admin_url( 'admin-ajax.php' ),
				'nonce'   => wp_create_nonce( self::NONCE_ACTION ),
				'i18n'    => array(
					'running'        => __( 'Running AutoPipeline…', 'onlinepress-autopipeline' ),
					'runNow'         => __( 'Run AutoPipeline Now', 'onlinepress-autopipeline' ),
					'longRunNotice'  => __( 'This triggers real NewsMe processing and can take a couple of minutes — please wait, the button is disabled until it finishes.', 'onlinepress-autopipeline' ),
				),
			)
		);
	}

	public function handle_run_now() {
		check_ajax_referer( self::NONCE_ACTION, 'nonce' );

		if ( ! current_user_can( 'manage_options' ) ) {
			wp_send_json_error( array( 'message' => __( 'Insufficient permissions.', 'onlinepress-autopipeline' ) ), 403 );
		}

		$result = OP_AutoPipeline_Scheduler::run_now();

		if ( 'failed' === $result['status'] ) {
			wp_send_json_error( array( 'message' => $result['reason'] ) );
		}

		if ( 'skipped' === $result['status'] ) {
			// Human-readable, not an error: this plugin's own lock is already
			// held by another run in progress. Never a raw error/stack trace.
			wp_send_json_success( array_merge( $result, array( 'message' => $result['reason'] ) ) );
		}

		wp_send_json_success( $result );
	}

	public function render_page() {
		if ( ! current_user_can( 'manage_options' ) ) {
			return;
		}

		$settings    = OP_AutoPipeline_Settings::all();
		$recent_runs = OP_AutoPipeline_Logger::get_recent_runs();
		$last_success = OP_AutoPipeline_Logger::get_last_successful_run();
		$last_failed  = OP_AutoPipeline_Logger::get_last_failed_run();
		$next_run     = OP_AutoPipeline_Scheduler::next_run_timestamp();
		$seo_provider = OP_AutoPipeline_Seo::detect_provider();

		require OP_AUTOPIPELINE_DIR . 'admin/views/settings-page.php';
	}
}

OP_AutoPipeline_Admin::init();
