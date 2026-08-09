<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Lightweight run logging: error_log for the raw trail, plus a small
 * capped history in wp_options so the admin page can show recent runs
 * without a dedicated DB table.
 */
class OP_AutoPipeline_Logger {

	const MAX_RUNS = 20;

	/** @var array */
	private $run;

	public function __construct() {
		$this->run = array(
			'run_id'     => wp_generate_uuid4(),
			'started_at' => current_time( 'mysql' ),
			'finished_at' => null,
			'trigger'    => 'manual',
			'status'     => 'running',
			'received'   => 0,
			'imported'   => 0,
			'published'  => 0,
			'skipped'    => 0,
			'failed'     => 0,
			'image_failures' => 0,
			'error'      => null,
		);
	}

	public function start( $trigger ) {
		$this->run['trigger'] = $trigger;
		$this->write( sprintf( 'run_start trigger=%s run_id=%s', $trigger, $this->run['run_id'] ) );
		return $this->run['run_id'];
	}

	public function set_received( $count ) {
		$this->run['received'] = (int) $count;
		$this->write( sprintf( 'articles_received count=%d', $count ) );
	}

	public function article_result( $external_id, $result ) {
		if ( isset( $result['status'] ) ) {
			switch ( $result['status'] ) {
				case 'imported':
					$this->run['imported']++;
					if ( ! empty( $result['published'] ) ) {
						$this->run['published']++;
					}
					break;
				case 'skipped':
					$this->run['skipped']++;
					break;
				case 'failed':
					$this->run['failed']++;
					break;
			}
			if ( ! empty( $result['image_failed'] ) ) {
				$this->run['image_failures']++;
			}
		}
		$this->write( sprintf(
			'article external_id=%s status=%s reason=%s',
			$external_id,
			isset( $result['status'] ) ? $result['status'] : 'unknown',
			isset( $result['reason'] ) ? $result['reason'] : ''
		) );
	}

	public function error( $message ) {
		$this->run['error'] = $message;
		$this->write( 'error ' . $message );
	}

	public function finish( $status = 'completed' ) {
		$this->run['status']      = $status;
		$this->run['finished_at'] = current_time( 'mysql' );
		$this->write( sprintf(
			'run_finish status=%s imported=%d skipped=%d failed=%d',
			$status,
			$this->run['imported'],
			$this->run['skipped'],
			$this->run['failed']
		) );
		$this->persist();
		return $this->run;
	}

	private function write( $message ) {
		// Never log secrets: callers must pass already-redacted messages.
		error_log( '[onlinepress-autopipeline] ' . $message );
	}

	private function persist() {
		$runs   = get_option( OP_AUTOPIPELINE_OPTION_RUNS, array() );
		$runs   = is_array( $runs ) ? $runs : array();
		array_unshift( $runs, $this->run );
		$runs = array_slice( $runs, 0, self::MAX_RUNS );
		update_option( OP_AUTOPIPELINE_OPTION_RUNS, $runs, false );
	}

	public static function get_recent_runs() {
		$runs = get_option( OP_AUTOPIPELINE_OPTION_RUNS, array() );
		return is_array( $runs ) ? $runs : array();
	}

	public static function get_last_successful_run() {
		foreach ( self::get_recent_runs() as $run ) {
			if ( 'completed' === $run['status'] ) {
				return $run;
			}
		}
		return null;
	}

	public static function get_last_failed_run() {
		foreach ( self::get_recent_runs() as $run ) {
			if ( 'failed' === $run['status'] ) {
				return $run;
			}
		}
		return null;
	}
}
