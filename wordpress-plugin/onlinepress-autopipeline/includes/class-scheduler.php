<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Owns WP-Cron scheduling and run locking. Only one pipeline run (manual or
 * scheduled) may execute at a time, enforced via a transient lock.
 */
class OP_AutoPipeline_Scheduler {

	const LOCK_TTL = 5 * MINUTE_IN_SECONDS;

	// Short-hop polling instead of one long-held request: the production
	// NewsMe domain sits behind Cloudflare, whose default proxy read timeout
	// (~100s) is well under the pipeline's worst-case duration. No single
	// HTTP call in the poll loop needs to stay open longer than ~20s.
	const POLL_INTERVAL_SECONDS = 5;
	const MAX_POLL_SECONDS      = 280;

	/**
	 * Called by WP-Cron. Triggers a real NewsMe processing run on every
	 * scheduled tick (same as the manual button) — this is the OnlinePress
	 * preference: "cron -> trigger processing -> import resulting articles",
	 * not a passive poll. Safe to call as often as the schedule allows
	 * because: (1) NewsMe's own daily article count / AI budget / allowed-
	 * hours gates remain in effect and are NOT bypassed by this — they are
	 * NewsMe's own governor, independent of how often this is called; and
	 * (2) NewsMe enforces a single concurrent pipeline run server-side (a
	 * database-backed lock), so an overlapping scheduled + manual trigger
	 * never causes duplicate processing.
	 */
	public static function run_scheduled_pipeline() {
		if ( ! OP_AutoPipeline_Settings::get( 'enabled', false ) ) {
			return array( 'status' => 'skipped', 'reason' => 'Pipeline is disabled in settings.' );
		}
		return self::run( 'scheduled', true );
	}

	/**
	 * Called from the wp-admin "Run AutoPipeline Now" button. Forces a fresh
	 * NewsMe generation cycle so the manual trigger has real, immediate effect.
	 */
	public static function run_now() {
		return self::run( 'manual', true );
	}

	private static function run( $trigger, $force_generation ) {
		if ( get_transient( OP_AUTOPIPELINE_LOCK_KEY ) ) {
			return array( 'status' => 'skipped', 'reason' => 'Another AutoPipeline run is already in progress.' );
		}
		set_transient( OP_AUTOPIPELINE_LOCK_KEY, time(), self::LOCK_TTL );

		$logger = new OP_AutoPipeline_Logger();
		$logger->start( $trigger );

		try {
			$client   = new OP_AutoPipeline_Api_Client();
			$settings = OP_AutoPipeline_Settings::all();

			$start_response = $client->start_pipeline(
				$settings['limit'],
				array(),
				$settings['import_status'],
				$force_generation
			);

			if ( is_wp_error( $start_response ) ) {
				$logger->error( $start_response->get_error_message() );
				$run = $logger->finish( 'failed' );
				delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
				return array( 'status' => 'failed', 'reason' => $start_response->get_error_message(), 'run' => $run );
			}

			$job_id = isset( $start_response['jobId'] ) ? $start_response['jobId'] : null;
			if ( ! $job_id ) {
				$logger->error( 'NewsMe did not return a job id from /pipeline/start.' );
				$run = $logger->finish( 'failed' );
				delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
				return array( 'status' => 'failed', 'reason' => 'NewsMe did not return a job id.', 'run' => $run );
			}

			$response = self::poll_until_done( $client, $job_id );

			if ( is_wp_error( $response ) ) {
				$logger->error( $response->get_error_message() );
				$run = $logger->finish( 'failed' );
				delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
				return array( 'status' => 'failed', 'reason' => $response->get_error_message(), 'run' => $run );
			}

			if ( 'failed' === $response['jobStatus'] ) {
				$message = isset( $response['error'] ) ? $response['error'] : 'Pipeline job failed.';
				$logger->error( $message );
				$run = $logger->finish( 'failed' );
				delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
				return array( 'status' => 'failed', 'reason' => $message, 'run' => $run );
			}

			// jobStatus === 'completed'. A run `status` other than 'ok' (e.g.
			// already_running/skipped) is not itself an error — NewsMe still
			// returns whatever pending articles it could safely offer.
			$articles = isset( $response['articles'] ) && is_array( $response['articles'] ) ? $response['articles'] : array();
			$run_id   = isset( $response['runId'] ) ? $response['runId'] : null;
			$logger->set_received( count( $articles ) );

			$importer = new OP_AutoPipeline_Importer();
			$batch    = $importer->import_batch( $articles, $settings['import_status'], (int) $settings['default_author'] );

			foreach ( $batch['results'] as $external_id => $result ) {
				$logger->article_result( $external_id, $result );
			}

			self::send_acknowledgements( $client, $batch['results'], $run_id );

			$run = $logger->finish( 'completed' );
			delete_transient( OP_AUTOPIPELINE_LOCK_KEY );

			return array(
				'status'  => 'completed',
				'stats'   => $batch['stats'],
				'run'     => $run,
				'run_id'  => $run_id,
			);
		} catch ( \Throwable $e ) {
			error_log( '[onlinepress-autopipeline] fatal_run_error ' . $e->getMessage() );
			$logger->error( 'fatal: ' . $e->getMessage() );
			$run = $logger->finish( 'failed' );
			delete_transient( OP_AUTOPIPELINE_LOCK_KEY );
			return array( 'status' => 'failed', 'reason' => $e->getMessage(), 'run' => $run );
		}
	}

	/**
	 * @return array|WP_Error The job response once jobStatus is no longer
	 *                        'processing', or a WP_Error on network failure
	 *                        or timeout. A timeout does NOT mean the pipeline
	 *                        failed — it may still complete server-side; the
	 *                        job is simply re-pollable (or the article
	 *                        surfaces via the normal undelivered-pool fetch
	 *                        on the next run) once it does.
	 */
	private static function poll_until_done( OP_AutoPipeline_Api_Client $client, $job_id ) {
		$elapsed = 0;
		while ( true ) {
			$response = $client->poll_pipeline( $job_id );

			if ( is_wp_error( $response ) ) {
				return $response;
			}

			if ( isset( $response['jobStatus'] ) && 'processing' !== $response['jobStatus'] ) {
				return $response;
			}

			if ( $elapsed >= self::MAX_POLL_SECONDS ) {
				return new WP_Error(
					'op_autopipeline_poll_timeout',
					sprintf(
						/* translators: %d: seconds waited */
						__( 'Timed out waiting for the pipeline job to finish after %ds. It may still complete on the NewsMe side — any resulting articles will surface on the next run.', 'onlinepress-autopipeline' ),
						self::MAX_POLL_SECONDS
					)
				);
			}

			onlinepress_autopipeline_sleep( self::POLL_INTERVAL_SECONDS );
			$elapsed += self::POLL_INTERVAL_SECONDS;
		}
	}

	private static function send_acknowledgements( OP_AutoPipeline_Api_Client $client, array $results, $run_id ) {
		$ack_articles = array();
		foreach ( $results as $external_id => $result ) {
			if ( 'imported' === $result['status'] ) {
				$ack_articles[] = array(
					'externalId'      => $external_id,
					'status'          => ! empty( $result['published'] ) ? 'published' : 'draft',
					'wordpressPostId' => isset( $result['post_id'] ) ? (int) $result['post_id'] : null,
					'wordpressUrl'    => isset( $result['url'] ) ? $result['url'] : null,
				);
			} elseif ( 'skipped' === $result['status'] && 'duplicate' === ( $result['reason'] ?? null ) ) {
				// The post already exists — most likely NewsMe re-offered this
				// article after its own delivery record expired (e.g. the ACK for
				// the original import never arrived). It must still be acked as a
				// success: otherwise NewsMe's delivery stays SENT/expired forever
				// and keeps re-offering an article WordPress already has, on every
				// redelivery window. This is what makes "post created, ACK lost,
				// redelivered 6h later" resolve into a single post + PUBLISHED
				// delivery instead of an infinite resend loop.
				$post_id = isset( $result['post_id'] ) ? (int) $result['post_id'] : null;
				$ack_articles[] = array(
					'externalId'      => $external_id,
					'status'          => ( $post_id && 'publish' === get_post_status( $post_id ) ) ? 'published' : 'draft',
					'wordpressPostId' => $post_id,
					'wordpressUrl'    => isset( $result['url'] ) ? $result['url'] : null,
				);
			} elseif ( 'failed' === $result['status'] ) {
				$ack_articles[] = array(
					'externalId' => $external_id,
					'status'     => 'failed',
					'error'      => isset( $result['reason'] ) ? substr( (string) $result['reason'], 0, 500 ) : 'Unknown error',
				);
			}
		}

		if ( empty( $ack_articles ) ) {
			return;
		}

		$ack_result = $client->send_ack( $ack_articles, $run_id );
		if ( is_wp_error( $ack_result ) ) {
			// Best-effort only: a failed ack must never fail the import that already happened.
			error_log( '[onlinepress-autopipeline] ack_failed ' . $ack_result->get_error_message() );
		}
	}

	public static function reschedule( $schedule ) {
		self::unschedule();
		if ( 'manual' === $schedule ) {
			return;
		}
		if ( ! wp_next_scheduled( OP_AUTOPIPELINE_CRON_HOOK ) ) {
			wp_schedule_event( time() + 60, $schedule, OP_AUTOPIPELINE_CRON_HOOK );
		}
	}

	public static function unschedule() {
		$timestamp = wp_next_scheduled( OP_AUTOPIPELINE_CRON_HOOK );
		while ( $timestamp ) {
			wp_unschedule_event( $timestamp, OP_AUTOPIPELINE_CRON_HOOK );
			$timestamp = wp_next_scheduled( OP_AUTOPIPELINE_CRON_HOOK );
		}
	}

	public static function next_run_timestamp() {
		return wp_next_scheduled( OP_AUTOPIPELINE_CRON_HOOK );
	}
}
