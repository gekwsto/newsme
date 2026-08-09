<?php

test( 'resolve_category creates a missing category by slug/name', function () {
	$id = OP_AutoPipeline_Category_Mapper::resolve_category( 'politiki', 'Πολιτική' );
	assert_that( ! is_wp_error( $id ), 'expected a term id, not a WP_Error' );
	$term = get_term_by( 'term_id', $id, 'category' );
	assert_equal( 'politiki', $term->slug );
	assert_equal( 'Πολιτική', $term->name );
} );

test( 'resolve_category reuses an existing category by slug instead of creating a duplicate', function () {
	$GLOBALS['__wp_terms']['category'][] = new WP_Term( 55, 'Πολιτική', 'politiki' );
	$id = OP_AutoPipeline_Category_Mapper::resolve_category( 'politiki', 'Πολιτική' );
	assert_equal( 55, $id );
	assert_equal( 1, count( $GLOBALS['__wp_terms']['category'] ), 'must not create a second term for the same slug' );
} );

test( 'resolve_category returns WP_Error when missing and auto-creation is disabled', function () {
	OP_AutoPipeline_Settings::update( array( 'create_missing_categories' => false ) );
	$result = OP_AutoPipeline_Category_Mapper::resolve_category( 'oikonomia', 'Οικονομία' );
	assert_instance_of( 'WP_Error', $result );
} );

test( 'resolve_tags creates missing tags and resolves existing ones by name', function () {
	$GLOBALS['__wp_terms']['post_tag'][] = new WP_Term( 10, 'Βουλή', 'vouli' );
	$ids = OP_AutoPipeline_Category_Mapper::resolve_tags( array( 'Βουλή', 'Κυβέρνηση' ) );
	assert_equal( 2, count( $ids ) );
	assert_that( in_array( 10, $ids, true ), 'existing tag "Βουλή" should resolve to its existing term id' );
	assert_equal( 2, count( $GLOBALS['__wp_terms']['post_tag'] ), 'only the missing tag should have been created' );
} );

test( 'resolve_tags skips creation when disabled, returning only pre-existing matches', function () {
	OP_AutoPipeline_Settings::update( array( 'create_missing_tags' => false ) );
	$GLOBALS['__wp_terms']['post_tag'][] = new WP_Term( 10, 'Βουλή', 'vouli' );
	$ids = OP_AutoPipeline_Category_Mapper::resolve_tags( array( 'Βουλή', 'Άγνωστο' ) );
	assert_equal( array( 10 ), $ids );
} );

test( 'resolve_tags ignores blank entries', function () {
	$ids = OP_AutoPipeline_Category_Mapper::resolve_tags( array( '', '  ', 'Real Tag' ) );
	assert_equal( 1, count( $ids ) );
} );
