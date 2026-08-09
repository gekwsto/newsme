<?php
require_once __DIR__ . '/wp-stubs.php';
require_once dirname( __DIR__ ) . '/onlinepress-autopipeline.php';

/**
 * Clears all in-memory WP-stub state between tests so each test starts from
 * a clean slate (mirrors a fresh WordPress install / fresh HTTP queue).
 */
function reset_wp_state() {
	$GLOBALS['__wp_options']           = array();
	$GLOBALS['__wp_terms']             = array();
	$GLOBALS['__wp_posts']             = array();
	$GLOBALS['__wp_postmeta']          = array();
	$GLOBALS['__wp_post_terms']        = array();
	$GLOBALS['__wp_thumbnails']        = array();
	$GLOBALS['__wp_transients']        = array();
	$GLOBALS['__wp_cron']              = array();
	$GLOBALS['__wp_http_queue']        = array();
	$GLOBALS['__wp_http_calls']        = array();
	$GLOBALS['__wp_next_post_id']      = 1;
	$GLOBALS['__wp_next_term_id']      = 1000;
	$GLOBALS['__media_sideload_queue'] = array();
	$GLOBALS['__wp_attachment_mime']   = array();
	OP_AutoPipeline_Settings::maybe_set_defaults();
}

function queue_http_response( $status, $body_array_or_string ) {
	$body                          = is_string( $body_array_or_string ) ? $body_array_or_string : wp_json_encode( $body_array_or_string );
	$GLOBALS['__wp_http_queue'][] = array(
		'response' => array( 'code' => $status ),
		'body'     => $body,
	);
}

function queue_http_error( $code, $message ) {
	$GLOBALS['__wp_http_queue'][] = new WP_Error( $code, $message );
}

/**
 * Queues the two HTTP responses a successful start+poll cycle produces:
 * the /pipeline/start response (jobId) and the /pipeline/{jobId} poll
 * response once the job is 'completed'. Mirrors the real NewsMe contract.
 */
function queue_pipeline_run( $run_id, array $articles = array(), ?array $stats = null, array $extra = array() ) {
	$job_id = 'job-for-' . $run_id;
	$stats  = $stats ?? array( 'discovered' => count( $articles ), 'processed' => count( $articles ), 'rejected' => 0, 'duplicates' => 0, 'returned' => count( $articles ) );

	queue_http_response( 200, array( 'success' => true, 'jobId' => $job_id, 'jobStatus' => 'processing' ) );
	queue_http_response( 200, array_merge(
		array(
			'success'  => true,
			'jobStatus'=> 'completed',
			'jobId'    => $job_id,
			'runId'    => $run_id,
			'articles' => $articles,
			'stats'    => $stats,
			'status'   => 'ok',
		),
		$extra
	) );
}

/** Queues a /pipeline/start success followed by a poll response reporting jobStatus: 'failed'. */
function queue_pipeline_job_failure( $error_message ) {
	$job_id = 'job-failed';
	queue_http_response( 200, array( 'success' => true, 'jobId' => $job_id, 'jobStatus' => 'processing' ) );
	queue_http_response( 200, array( 'success' => true, 'jobStatus' => 'failed', 'jobId' => $job_id, 'error' => $error_message ) );
}

function sample_article( array $overrides = array() ) {
	return array_merge(
		array(
			'externalId'    => 'article-1',
			'title'         => 'Τίτλος άρθρου',
			'slug'          => 'titlos-arthrou',
			'content'       => '<p>Κείμενο άρθρου</p>',
			'excerpt'       => 'Περίληψη',
			'category'      => array( 'slug' => 'politiki', 'name' => 'Πολιτική' ),
			'tags'          => array( 'Κυβέρνηση', 'Βουλή' ),
			'featuredImage' => null,
			'seo'           => array( 'title' => 'SEO τίτλος', 'description' => 'SEO περιγραφή' ),
			'publishedAt'   => null,
		),
		$overrides
	);
}
