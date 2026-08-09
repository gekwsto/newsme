<?php

test( 'successful import creates a post with category, tags, meta and SEO fallback', function () {
	$importer = new OP_AutoPipeline_Importer();
	$batch    = $importer->import_batch( array( sample_article() ), 'draft', 1 );

	$result = $batch['results']['article-1'];
	assert_equal( 'imported', $result['status'] );
	assert_that( ! empty( $result['post_id'] ), 'expected a post_id' );

	$post = $GLOBALS['__wp_posts'][ $result['post_id'] ];
	assert_equal( 'draft', $post['post_status'] );
	assert_equal( 'Τίτλος άρθρου', $post['post_title'] );
	assert_equal( 'article-1', $GLOBALS['__wp_postmeta'][ $result['post_id'] ]['_newsme_article_id'] );

	$category_terms = $GLOBALS['__wp_terms']['category'];
	assert_equal( 1, count( $category_terms ) );
	assert_equal( 'politiki', $category_terms[0]->slug );

	assert_equal( 2, count( $GLOBALS['__wp_post_terms'][ $result['post_id'] ]['post_tag'] ) );

	assert_equal( 'SEO τίτλος', $GLOBALS['__wp_postmeta'][ $result['post_id'] ]['_onlinepress_autopipeline_seo_title'] );
	assert_equal( 1, $batch['stats']['imported'] );
	assert_equal( 0, $batch['stats']['published'], 'draft import must not count as published' );
} );

test( 'publish status is honored end to end', function () {
	$importer = new OP_AutoPipeline_Importer();
	$batch    = $importer->import_batch( array( sample_article( array( 'externalId' => 'article-pub' ) ) ), 'publish', 1 );
	$result   = $batch['results']['article-pub'];
	assert_equal( 'publish', $GLOBALS['__wp_posts'][ $result['post_id'] ]['post_status'] );
	assert_that( $result['published'], 'result should report published:true' );
	assert_equal( 1, $batch['stats']['published'] );
} );

test( 'a second import of the same externalId is skipped as a duplicate, no second post created', function () {
	$importer = new OP_AutoPipeline_Importer();
	$first    = $importer->import_batch( array( sample_article() ), 'draft', 1 );
	assert_equal( 'imported', $first['results']['article-1']['status'] );
	assert_equal( 1, count( $GLOBALS['__wp_posts'] ) );

	$second = $importer->import_batch( array( sample_article() ), 'draft', 1 );
	assert_equal( 'skipped', $second['results']['article-1']['status'] );
	assert_equal( 'duplicate', $second['results']['article-1']['reason'] );
	assert_equal( 1, count( $GLOBALS['__wp_posts'] ), 'no second post should have been created' );
	assert_equal( 1, $second['stats']['skipped'] );
} );

test( 'existing category is reused by slug instead of creating a new one', function () {
	$GLOBALS['__wp_terms']['category'][] = new WP_Term( 77, 'Πολιτική', 'politiki' );
	$importer = new OP_AutoPipeline_Importer();
	$batch    = $importer->import_batch( array( sample_article() ), 'draft', 1 );
	$post_id  = $batch['results']['article-1']['post_id'];
	assert_equal( array( 77 ), $GLOBALS['__wp_posts'][ $post_id ]['post_category'] );
	assert_equal( 1, count( $GLOBALS['__wp_terms']['category'] ) );
} );

test( 'validation failure (missing required field) fails that article without throwing', function () {
	$importer = new OP_AutoPipeline_Importer();
	$batch    = $importer->import_batch( array( sample_article( array( 'title' => '' ) ) ), 'draft', 1 );
	$result   = $batch['results']['article-1'];
	assert_equal( 'failed', $result['status'] );
	assert_that( false !== strpos( $result['reason'], 'title' ), 'reason should mention the missing field' );
	assert_equal( 1, $batch['stats']['failed'] );
	assert_equal( 0, count( $GLOBALS['__wp_posts'] ) );
} );

test( 'a failed image sideload does not fail the article import (failure isolation)', function () {
	$GLOBALS['__media_sideload_queue'][] = new WP_Error( 'op_test_sideload_failed', 'boom' );
	$importer = new OP_AutoPipeline_Importer();
	$article  = sample_article( array( 'featuredImage' => array( 'url' => 'https://img.example.com/a.jpg', 'alt' => 'a', 'caption' => '' ) ) );
	$batch    = $importer->import_batch( array( $article ), 'draft', 1 );
	$result   = $batch['results']['article-1'];
	assert_equal( 'imported', $result['status'] );
	assert_that( ! empty( $result['image_failed'] ), 'expected image_failed to be true' );
	assert_equal( 1, $batch['stats']['image_failures'] );
} );

test( 'a successful image sideload sets the post thumbnail', function () {
	$importer = new OP_AutoPipeline_Importer();
	$article  = sample_article( array( 'featuredImage' => array( 'url' => 'https://img.example.com/a.jpg', 'alt' => 'a', 'caption' => 'c' ) ) );
	$batch    = $importer->import_batch( array( $article ), 'draft', 1 );
	$post_id  = $batch['results']['article-1']['post_id'];
	assert_that( isset( $GLOBALS['__wp_thumbnails'][ $post_id ] ), 'expected a featured image to be attached' );
	assert_that( empty( $batch['results']['article-1']['image_failed'] ), 'image_failed should be false on success' );
} );

test( 'one bad article in a batch does not break the others (per-article isolation)', function () {
	$importer = new OP_AutoPipeline_Importer();
	$batch    = $importer->import_batch(
		array(
			sample_article( array( 'externalId' => 'ok-1' ) ),
			sample_article( array( 'externalId' => 'bad-1', 'title' => '' ) ),
			sample_article( array( 'externalId' => 'ok-2' ) ),
		),
		'draft',
		1
	);
	assert_equal( 'imported', $batch['results']['ok-1']['status'] );
	assert_equal( 'failed', $batch['results']['bad-1']['status'] );
	assert_equal( 'imported', $batch['results']['ok-2']['status'] );
	assert_equal( 2, $batch['stats']['imported'] );
	assert_equal( 1, $batch['stats']['failed'] );
} );
