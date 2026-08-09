<?php

function configure_api( $url = 'https://newsme.gr/api/integrations/wordpress/pipeline', $key = 'test-secret' ) {
	OP_AutoPipeline_Settings::update( array( 'api_url' => $url, 'api_key' => $key ) );
}

test( 'fetch_pipeline returns the decoded body on a 200 success response', function () {
	configure_api();
	queue_http_response( 200, array(
		'success' => true,
		'runId'   => 'run-1',
		'articles' => array(),
		'stats'   => array( 'discovered' => 0, 'processed' => 0, 'rejected' => 0, 'duplicates' => 0, 'returned' => 0 ),
	) );
	$client = new OP_AutoPipeline_Api_Client();
	$result = $client->fetch_pipeline( 10, array(), 'draft', false );
	assert_that( ! is_wp_error( $result ), 'expected a successful array response' );
	assert_equal( 'run-1', $result['runId'] );
} );

test( 'fetch_pipeline returns WP_Error on 401 Unauthorized', function () {
	configure_api();
	queue_http_response( 401, array( 'success' => false, 'error' => 'Unauthorized' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_unauthorized', $result->get_error_code() );
} );

test( 'fetch_pipeline returns WP_Error on malformed JSON', function () {
	configure_api();
	queue_http_response( 200, 'this is not { json' );
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_malformed_response', $result->get_error_code() );
} );

test( 'fetch_pipeline returns WP_Error on network failure / timeout', function () {
	configure_api();
	queue_http_error( 'http_request_failed', 'cURL error 28: Operation timed out' );
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_network_error', $result->get_error_code() );
} );

test( 'fetch_pipeline returns WP_Error on a NewsMe 5xx', function () {
	configure_api();
	queue_http_response( 500, array( 'success' => false, 'error' => 'Internal pipeline error' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_server_error', $result->get_error_code() );
} );

test( 'fetch_pipeline returns WP_Error on 429 rate limit', function () {
	configure_api();
	queue_http_response( 429, array( 'success' => false, 'error' => 'Too many requests' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_rate_limited', $result->get_error_code() );
} );

test( 'fetch_pipeline fails fast when not configured, without making an HTTP call', function () {
	// api_url/api_key left at defaults (empty).
	$result = ( new OP_AutoPipeline_Api_Client() )->fetch_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_not_configured', $result->get_error_code() );
	assert_equal( 0, count( $GLOBALS['__wp_http_queue'] ), 'queue should be untouched — no request should have been attempted' );
} );

test( 'send_ack posts to the sibling /articles/ack endpoint derived from the pipeline URL', function () {
	configure_api( 'https://newsme.gr/api/integrations/wordpress/pipeline', 'secret' );
	queue_http_response( 200, array( 'success' => true, 'results' => array() ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->send_ack( array( array( 'externalId' => 'a1', 'status' => 'published' ) ), 'run-1' );
	assert_that( ! is_wp_error( $result ), 'expected a successful ack response' );
	$last_call = end( $GLOBALS['__wp_http_calls'] );
	assert_that( false !== strpos( $last_call['url'], '/articles/ack' ), 'ack must be posted to the /articles/ack endpoint, got: ' . $last_call['url'] );
} );

test( 'start_pipeline posts to the /pipeline/start endpoint and returns a jobId', function () {
	configure_api();
	queue_http_response( 200, array( 'success' => true, 'jobId' => 'job-1', 'jobStatus' => 'processing' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->start_pipeline( 10, array(), 'draft', true );
	assert_that( ! is_wp_error( $result ), 'expected a successful start response' );
	assert_equal( 'job-1', $result['jobId'] );
	$last_call = end( $GLOBALS['__wp_http_calls'] );
	assert_that( false !== strpos( $last_call['url'], '/pipeline/start' ), 'must post to /pipeline/start, got: ' . $last_call['url'] );
	assert_equal( 'POST', $last_call['method'] );
	$sent_body = json_decode( $last_call['args']['body'], true );
	assert_equal( true, $sent_body['triggerRun'] );
} );

test( 'start_pipeline fails fast when not configured, without an HTTP call', function () {
	$result = ( new OP_AutoPipeline_Api_Client() )->start_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_not_configured', $result->get_error_code() );
} );

test( 'start_pipeline surfaces a 401 the same way fetch_pipeline does', function () {
	configure_api();
	queue_http_response( 401, array( 'success' => false, 'error' => 'Unauthorized' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->start_pipeline( 10 );
	assert_instance_of( 'WP_Error', $result );
	assert_equal( 'op_autopipeline_unauthorized', $result->get_error_code() );
} );

test( 'poll_pipeline sends a short-timeout GET to /pipeline/{jobId} with the site as a query param', function () {
	configure_api();
	queue_http_response( 200, array( 'success' => true, 'jobStatus' => 'processing', 'jobId' => 'job-1' ) );
	$result = ( new OP_AutoPipeline_Api_Client() )->poll_pipeline( 'job-1' );
	assert_that( ! is_wp_error( $result ), 'expected a successful poll response' );
	assert_equal( 'processing', $result['jobStatus'] );
	$last_call = end( $GLOBALS['__wp_http_calls'] );
	assert_equal( 'GET', $last_call['method'] );
	assert_that( false !== strpos( $last_call['url'], '/pipeline/job-1' ), 'must GET /pipeline/{jobId}, got: ' . $last_call['url'] );
	assert_that( false !== strpos( $last_call['url'], 'site=' . OP_AutoPipeline_Settings::SITE_ID ), 'must include the site query param, got: ' . $last_call['url'] );
	assert_equal( 20, $last_call['args']['timeout'], 'each individual poll must be a short-timeout call, not a long-held one' );
} );

test( 'poll_pipeline surfaces a completed job result', function () {
	configure_api();
	queue_http_response( 200, array(
		'success'  => true,
		'jobStatus'=> 'completed',
		'jobId'    => 'job-1',
		'runId'    => 'run-1',
		'articles' => array(),
		'stats'    => array( 'discovered' => 0, 'processed' => 0, 'rejected' => 0, 'duplicates' => 0, 'returned' => 0 ),
		'status'   => 'ok',
	) );
	$result = ( new OP_AutoPipeline_Api_Client() )->poll_pipeline( 'job-1' );
	assert_equal( 'completed', $result['jobStatus'] );
	assert_equal( 'run-1', $result['runId'] );
} );
