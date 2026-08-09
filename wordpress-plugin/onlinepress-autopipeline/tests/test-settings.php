<?php

test( 'sanitize() accepts a fully valid settings payload', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array(
		'api_url'       => 'https://newsme.gr/api/integrations/wordpress/pipeline',
		'api_key'       => 'secret-key',
		'enabled'       => true,
		'limit'         => 10,
		'import_status' => 'publish',
		'schedule'      => 'hourly',
		'default_author'=> 1,
		'create_missing_categories' => true,
		'create_missing_tags'       => false,
	) );
	assert_equal( 'https://newsme.gr/api/integrations/wordpress/pipeline', $out['api_url'] );
	assert_equal( 'secret-key', $out['api_key'] );
	assert_equal( true, $out['enabled'] );
	assert_equal( 10, $out['limit'] );
	assert_equal( 'publish', $out['import_status'] );
	assert_equal( 'hourly', $out['schedule'] );
	assert_equal( false, $out['create_missing_tags'] );
} );

test( 'update() with a blank api_key keeps the previously stored key (never blanked by redisplay)', function () {
	OP_AutoPipeline_Settings::update( array( 'api_key' => 'first-secret' ) );
	OP_AutoPipeline_Settings::update( array( 'api_key' => '' ) );
	assert_equal( 'first-secret', OP_AutoPipeline_Settings::get( 'api_key' ) );
} );

test( 'an out-of-range limit falls back to the default', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array( 'limit' => 999 ) );
	assert_equal( 10, $out['limit'] );
} );

test( 'an unknown schedule value falls back to "manual"', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array( 'schedule' => 'every-5-seconds' ) );
	assert_equal( 'manual', $out['schedule'] );
} );

test( 'an unknown import_status falls back to "draft"', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array( 'import_status' => 'delete-everything' ) );
	assert_equal( 'draft', $out['import_status'] );
} );

test( 'a non-existent default_author falls back to the current user', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array( 'default_author' => 0 ) );
	assert_equal( get_current_user_id(), $out['default_author'] );
} );

test( 'api_url is run through esc_url_raw (no javascript: or malformed schemes persisted verbatim)', function () {
	$out = OP_AutoPipeline_Settings::sanitize( array( 'api_url' => '  https://newsme.gr/api  ' ) );
	assert_equal( 'https://newsme.gr/api', $out['api_url'] );
} );
