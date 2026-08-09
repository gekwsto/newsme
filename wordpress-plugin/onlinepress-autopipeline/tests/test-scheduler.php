<?php

test( 'a second run is skipped while the cron lock transient is held', function () {
	set_transient( OP_AUTOPIPELINE_LOCK_KEY, time(), 300 );
	$result = OP_AutoPipeline_Scheduler::run_now();
	assert_equal( 'skipped', $result['status'] );
	assert_that( false !== strpos( $result['reason'], 'already in progress' ), 'reason should explain the lock' );
	assert_equal( 0, count( $GLOBALS['__wp_http_queue'] ) + count( $GLOBALS['__wp_http_calls'] ), 'a locked run must not make any HTTP request' );
} );

test( 'run_scheduled_pipeline is skipped when the pipeline is disabled in settings', function () {
	OP_AutoPipeline_Settings::update( array( 'enabled' => false ) );
	$result = OP_AutoPipeline_Scheduler::run_scheduled_pipeline();
	assert_equal( 'skipped', $result['status'] );
} );

test( 'run_scheduled_pipeline triggers real NewsMe processing (triggerRun: true), same as the manual button', function () {
	OP_AutoPipeline_Settings::update( array(
		'enabled' => true,
		'api_url' => 'https://newsme.gr/api/integrations/wordpress/pipeline',
		'api_key' => 'secret',
	) );
	queue_pipeline_run( 'run-cron', array() );

	$result = OP_AutoPipeline_Scheduler::run_scheduled_pipeline();

	assert_equal( 'completed', $result['status'] );
	assert_equal( 2, count( $GLOBALS['__wp_http_calls'] ), 'expected one /start call + one /poll call (no ack — zero articles)' );
	$sent_body = json_decode( $GLOBALS['__wp_http_calls'][0]['args']['body'], true );
	assert_equal( true, $sent_body['triggerRun'] );
	assert_that( false !== strpos( $GLOBALS['__wp_http_calls'][0]['url'], '/start' ), 'first call must hit /pipeline/start' );
	assert_equal( 'GET', $GLOBALS['__wp_http_calls'][1]['method'] );
} );

test( 'reschedule("manual") clears any existing scheduled cron event', function () {
	OP_AutoPipeline_Scheduler::reschedule( 'hourly' );
	assert_that( false !== OP_AutoPipeline_Scheduler::next_run_timestamp(), 'expected a scheduled run after reschedule("hourly")' );
	OP_AutoPipeline_Scheduler::reschedule( 'manual' );
	assert_equal( false, OP_AutoPipeline_Scheduler::next_run_timestamp() );
} );

test( 'reschedule to a recurring interval schedules exactly one cron event (no duplicates)', function () {
	OP_AutoPipeline_Scheduler::reschedule( 'op_autopipeline_15min' );
	OP_AutoPipeline_Scheduler::reschedule( 'op_autopipeline_15min' );
	assert_equal( 1, count( $GLOBALS['__wp_cron'] ), 'must not accumulate duplicate cron registrations' );
} );

test( 'unschedule clears the cron event (used on plugin deactivation)', function () {
	OP_AutoPipeline_Scheduler::reschedule( 'hourly' );
	OP_AutoPipeline_Scheduler::unschedule();
	assert_equal( false, OP_AutoPipeline_Scheduler::next_run_timestamp() );
} );

test( 'a full run_now cycle fetches, imports, and sends an ack, releasing the lock afterwards', function () {
	OP_AutoPipeline_Settings::update( array(
		'api_url' => 'https://newsme.gr/api/integrations/wordpress/pipeline',
		'api_key' => 'secret',
		'limit'   => 10,
		'import_status' => 'draft',
	) );

	queue_pipeline_run( 'run-xyz', array( sample_article() ) );
	queue_http_response( 200, array( 'success' => true, 'results' => array( array( 'externalId' => 'article-1', 'acknowledged' => true ) ) ) );

	$result = OP_AutoPipeline_Scheduler::run_now();

	assert_equal( 'completed', $result['status'] );
	assert_equal( 1, $result['stats']['imported'] );
	assert_equal( 3, count( $GLOBALS['__wp_http_calls'] ), 'expected /start + /poll + /ack HTTP calls' );
	assert_equal( false, get_transient( OP_AUTOPIPELINE_LOCK_KEY ), 'lock must be released after the run finishes' );

	$sent_body = json_decode( $GLOBALS['__wp_http_calls'][0]['args']['body'], true );
	assert_equal( true, $sent_body['triggerRun'], 'the manual button must request a real trigger, not just a fetch' );

	$runs = OP_AutoPipeline_Logger::get_recent_runs();
	assert_equal( 1, count( $runs ) );
	assert_equal( 'completed', $runs[0]['status'] );
	assert_equal( 1, $runs[0]['imported'] );
} );

test( 'IDEMPOTENCY RECOVERY: post created but ACK lost, article redelivered later — no duplicate post, ACK now succeeds', function () {
	OP_AutoPipeline_Settings::update( array(
		'api_url'        => 'https://newsme.gr/api/integrations/wordpress/pipeline',
		'api_key'        => 'secret',
		'limit'          => 10,
		'import_status'  => 'draft',
	) );

	// --- First delivery: WordPress successfully creates the post, but the
	//     connection breaks before the ACK response reaches NewsMe. ---
	queue_pipeline_run( 'run-1', array( sample_article() ) );
	queue_http_error( 'http_request_failed', 'connection broke before the ack response arrived' );

	$first = OP_AutoPipeline_Scheduler::run_now();
	assert_equal( 'completed', $first['status'] );
	assert_equal( 1, $first['stats']['imported'] );
	assert_equal( 1, count( $GLOBALS['__wp_posts'] ), 'exactly one post should exist after the first successful import' );

	// --- 6 hours later (simulated): NewsMe, never having received the ack,
	//     still thinks this article is undelivered and redelivers it. ---
	queue_pipeline_run( 'run-2', array( sample_article() ) ); // identical externalId: 'article-1'
	queue_http_response( 200, array( 'success' => true, 'results' => array() ) ); // ack succeeds this time

	$second = OP_AutoPipeline_Scheduler::run_now();

	assert_equal( 'completed', $second['status'] );
	assert_equal( 0, $second['stats']['imported'], 'the duplicate must not count as a new import' );
	assert_equal( 1, $second['stats']['skipped'] );
	assert_equal( 1, count( $GLOBALS['__wp_posts'] ), 'WordPress post count must stay at 1 — no duplicate created' );

	// The ack for the redelivered duplicate must still report success — omitting
	// it (the old behavior) would leave NewsMe's delivery record stuck, and it
	// would keep re-offering this article forever on every redelivery window.
	$ack_call = end( $GLOBALS['__wp_http_calls'] );
	$ack_body = json_decode( $ack_call['args']['body'], true );
	assert_equal( 1, count( $ack_body['articles'] ) );
	assert_equal( 'article-1', $ack_body['articles'][0]['externalId'] );
	assert_equal( 'draft', $ack_body['articles'][0]['status'] );
} );

test( 'a job that never leaves "processing" times out cleanly (not a fatal crash) after MAX_POLL_SECONDS', function () {
	OP_AutoPipeline_Settings::update( array( 'api_url' => 'https://newsme.gr/api/integrations/wordpress/pipeline', 'api_key' => 'secret' ) );

	queue_http_response( 200, array( 'success' => true, 'jobId' => 'job-stuck', 'jobStatus' => 'processing' ) );
	$max_iterations = ( OP_AutoPipeline_Scheduler::MAX_POLL_SECONDS / OP_AutoPipeline_Scheduler::POLL_INTERVAL_SECONDS ) + 1;
	for ( $i = 0; $i <= $max_iterations; $i++ ) {
		queue_http_response( 200, array( 'success' => true, 'jobStatus' => 'processing', 'jobId' => 'job-stuck' ) );
	}

	$result = OP_AutoPipeline_Scheduler::run_now();

	assert_equal( 'failed', $result['status'] );
	assert_that( false !== strpos( $result['reason'], 'Timed out' ), 'expected a clean timeout message, got: ' . $result['reason'] );
	assert_equal( false, get_transient( OP_AUTOPIPELINE_LOCK_KEY ), 'lock must still be released even after a poll timeout' );
} );

test( 'a job that itself reports jobStatus: failed is recorded as a failed run, and the lock is released', function () {
	OP_AutoPipeline_Settings::update( array( 'api_url' => 'https://newsme.gr/api/integrations/wordpress/pipeline', 'api_key' => 'secret' ) );
	queue_pipeline_job_failure( 'the pipeline crashed mid-run' );

	$result = OP_AutoPipeline_Scheduler::run_now();

	assert_equal( 'failed', $result['status'] );
	assert_equal( 'the pipeline crashed mid-run', $result['reason'] );
	assert_equal( false, get_transient( OP_AUTOPIPELINE_LOCK_KEY ) );
} );

test( 'when NewsMe returns 401, the run is recorded as failed and the lock is released', function () {
	OP_AutoPipeline_Settings::update( array( 'api_url' => 'https://newsme.gr/api/integrations/wordpress/pipeline', 'api_key' => 'wrong' ) );
	queue_http_response( 401, array( 'success' => false, 'error' => 'Unauthorized' ) );

	$result = OP_AutoPipeline_Scheduler::run_now();

	assert_equal( 'failed', $result['status'] );
	assert_equal( false, get_transient( OP_AUTOPIPELINE_LOCK_KEY ) );
	assert_equal( 'failed', OP_AutoPipeline_Logger::get_recent_runs()[0]['status'] );
} );
