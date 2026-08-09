<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Talks to the NewsMe integration API. Uses the WordPress HTTP API
 * (wp_remote_post) exclusively — no raw curl. Never AI/RSS logic here;
 * this class only moves already-processed data across the wire.
 */
class OP_AutoPipeline_Api_Client {

	/** @var string */
	private $base_url;

	/** @var string */
	private $api_key;

	public function __construct() {
		$this->base_url = untrailingslashit( OP_AutoPipeline_Settings::get( 'api_url', '' ) );
		$this->api_key  = OP_AutoPipeline_Settings::get( 'api_key', '' );
	}

	public function is_configured() {
		return ! empty( $this->base_url ) && ! empty( $this->api_key );
	}

	/**
	 * @return array|WP_Error Decoded response body on success (success:true),
	 *                        or WP_Error describing exactly what went wrong.
	 */
	public function fetch_pipeline( $limit, $categories = array(), $publish_mode = 'draft', $trigger_run = false ) {
		if ( ! $this->is_configured() ) {
			return new WP_Error( 'op_autopipeline_not_configured', __( 'NewsMe API URL/key are not configured.', 'onlinepress-autopipeline' ) );
		}

		$body = array(
			'site'        => OP_AutoPipeline_Settings::SITE_ID,
			'limit'       => (int) $limit,
			'categories'  => array_values( array_filter( (array) $categories ) ),
			'publishMode' => 'publish' === $publish_mode ? 'publish' : 'draft',
			'triggerRun'  => (bool) $trigger_run,
		);

		// A forced generation run can take up to ~270s server-side (NewsMe's own
		// internal budget) — wait comfortably past that. A pure fetch-pending
		// call (MODE B) should come back quickly. Note: PHP's own
		// max_execution_time on this WordPress host must also exceed 290s for
		// the wp-admin "Run Now" button and wp-cron request to not be killed
		// before this HTTP call itself times out — see README troubleshooting.
		$timeout = $trigger_run ? 290 : 30;

		$response = wp_remote_post(
			$this->base_url,
			array(
				'timeout' => $timeout,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $this->api_key,
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		return $this->handle_response( $response, 'fetch_pipeline' );
	}

	/**
	 * Starts an async pipeline run (POST .../pipeline/start) and returns
	 * immediately with a pollable job id — see poll_pipeline(). Used instead
	 * of fetch_pipeline()'s single long-held request because the production
	 * NewsMe domain sits behind Cloudflare, whose default proxy read timeout
	 * (~100s) is well under the pipeline's worst-case duration (~270s+).
	 * Splitting into short start+poll calls means no single HTTP request to
	 * NewsMe needs to stay open longer than a few seconds.
	 *
	 * @return array|WP_Error { jobId, jobStatus } on success.
	 */
	public function start_pipeline( $limit, $categories = array(), $publish_mode = 'draft', $trigger_run = true ) {
		if ( ! $this->is_configured() ) {
			return new WP_Error( 'op_autopipeline_not_configured', __( 'NewsMe API URL/key are not configured.', 'onlinepress-autopipeline' ) );
		}

		$body = array(
			'site'        => OP_AutoPipeline_Settings::SITE_ID,
			'limit'       => (int) $limit,
			'categories'  => array_values( array_filter( (array) $categories ) ),
			'publishMode' => 'publish' === $publish_mode ? 'publish' : 'draft',
			'triggerRun'  => (bool) $trigger_run,
		);

		$response = wp_remote_post(
			untrailingslashit( $this->base_url ) . '/start',
			array(
				'timeout' => 20, // this call only creates a job row — it must return almost immediately
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $this->api_key,
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		return $this->handle_response( $response, 'start_pipeline' );
	}

	/**
	 * Polls the status/result of a job started via start_pipeline().
	 *
	 * @return array|WP_Error { jobStatus: processing|completed|failed, ... }
	 */
	public function poll_pipeline( $job_id ) {
		if ( ! $this->is_configured() ) {
			return new WP_Error( 'op_autopipeline_not_configured', __( 'NewsMe API URL/key are not configured.', 'onlinepress-autopipeline' ) );
		}

		$url = untrailingslashit( $this->base_url ) . '/' . rawurlencode( $job_id ) . '?site=' . rawurlencode( OP_AutoPipeline_Settings::SITE_ID );

		$response = wp_remote_get(
			$url,
			array(
				'timeout' => 20,
				'headers' => array(
					'Authorization' => 'Bearer ' . $this->api_key,
				),
			)
		);

		return $this->handle_response( $response, 'poll_pipeline' );
	}

	/**
	 * Best-effort acknowledgement. Failures here must never break the import
	 * that already happened — callers should log and move on.
	 *
	 * @return array|WP_Error
	 */
	public function send_ack( array $articles, $run_id = null ) {
		if ( ! $this->is_configured() || empty( $articles ) ) {
			return new WP_Error( 'op_autopipeline_ack_skipped', 'Ack skipped: not configured or nothing to ack.' );
		}

		$ack_url = $this->base_url;
		// The ack endpoint is a sibling of the pipeline endpoint under the
		// same integration namespace: .../wordpress/pipeline -> .../wordpress/articles/ack.
		if ( false !== strpos( $ack_url, '/pipeline' ) ) {
			$ack_url = str_replace( '/pipeline', '/articles/ack', $ack_url );
		} else {
			$ack_url = untrailingslashit( $ack_url ) . '/articles/ack';
		}

		$body = array(
			'site'     => OP_AutoPipeline_Settings::SITE_ID,
			'runId'    => $run_id,
			'articles' => $articles,
		);

		$response = wp_remote_post(
			$ack_url,
			array(
				'timeout' => 20,
				'headers' => array(
					'Content-Type'  => 'application/json',
					'Authorization' => 'Bearer ' . $this->api_key,
				),
				'body'    => wp_json_encode( $body ),
			)
		);

		return $this->handle_response( $response, 'send_ack' );
	}

	/**
	 * @param array|WP_Error $response
	 * @return array|WP_Error
	 */
	private function handle_response( $response, $context ) {
		if ( is_wp_error( $response ) ) {
			error_log( '[onlinepress-autopipeline] ' . $context . ' network_error: ' . $response->get_error_message() );
			return new WP_Error( 'op_autopipeline_network_error', __( 'Could not reach NewsMe (network error or timeout).', 'onlinepress-autopipeline' ) );
		}

		$status = wp_remote_retrieve_response_code( $response );
		$raw    = wp_remote_retrieve_body( $response );

		if ( 401 === $status ) {
			error_log( '[onlinepress-autopipeline] ' . $context . ' unauthorized (401)' );
			return new WP_Error( 'op_autopipeline_unauthorized', __( 'NewsMe rejected the API key (401 Unauthorized).', 'onlinepress-autopipeline' ) );
		}

		if ( 429 === $status ) {
			return new WP_Error( 'op_autopipeline_rate_limited', __( 'NewsMe rate-limited this request. Try again shortly.', 'onlinepress-autopipeline' ) );
		}

		if ( $status >= 500 ) {
			error_log( '[onlinepress-autopipeline] ' . $context . ' server_error status=' . $status );
			return new WP_Error( 'op_autopipeline_server_error', sprintf( __( 'NewsMe returned a server error (HTTP %d).', 'onlinepress-autopipeline' ), $status ) );
		}

		$decoded = json_decode( $raw, true );
		if ( null === $decoded && JSON_ERROR_NONE !== json_last_error() ) {
			error_log( '[onlinepress-autopipeline] ' . $context . ' malformed_json' );
			return new WP_Error( 'op_autopipeline_malformed_response', __( 'NewsMe returned a response that could not be parsed as JSON.', 'onlinepress-autopipeline' ) );
		}

		if ( $status < 200 || $status >= 300 ) {
			$message = isset( $decoded['error'] ) ? $decoded['error'] : sprintf( 'HTTP %d', $status );
			error_log( '[onlinepress-autopipeline] ' . $context . ' error status=' . $status );
			return new WP_Error( 'op_autopipeline_api_error', $message );
		}

		if ( ! is_array( $decoded ) || empty( $decoded['success'] ) ) {
			$message = isset( $decoded['error'] ) ? $decoded['error'] : __( 'Unexpected response shape from NewsMe.', 'onlinepress-autopipeline' );
			return new WP_Error( 'op_autopipeline_api_error', $message );
		}

		return $decoded;
	}
}
