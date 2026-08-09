<?php
/**
 * Tiny assertion-based test runner. No Composer/PHPUnit dependency —
 * keeps the plugin installable/testable with nothing but a PHP CLI.
 */

$GLOBALS['__test_pass_count'] = 0;
$GLOBALS['__test_fail_count'] = 0;
$GLOBALS['__test_current']    = '';

function test( $name, callable $fn ) {
	$GLOBALS['__test_current'] = $name;
	reset_wp_state();
	try {
		$fn();
		$GLOBALS['__test_pass_count']++;
		echo "  \033[32mPASS\033[0m  {$name}\n";
	} catch ( \Throwable $e ) {
		$GLOBALS['__test_fail_count']++;
		echo "  \033[31mFAIL\033[0m  {$name}\n";
		echo "        " . $e->getMessage() . "\n";
	}
}

function assert_that( $condition, $message ) {
	if ( ! $condition ) {
		throw new Exception( $message );
	}
}

function assert_equal( $expected, $actual, $message = '' ) {
	if ( $expected !== $actual ) {
		throw new Exception( sprintf( '%sExpected %s, got %s', $message ? $message . ': ' : '', var_export( $expected, true ), var_export( $actual, true ) ) );
	}
}

function assert_instance_of( $class, $value, $message = '' ) {
	if ( ! ( $value instanceof $class ) ) {
		throw new Exception( sprintf( '%sExpected instance of %s, got %s', $message ? $message . ': ' : '', $class, is_object( $value ) ? get_class( $value ) : gettype( $value ) ) );
	}
}

function print_summary() {
	$pass = $GLOBALS['__test_pass_count'];
	$fail = $GLOBALS['__test_fail_count'];
	echo "\n" . ( $fail ? "\033[31m" : "\033[32m" ) . "{$pass} passed, {$fail} failed\033[0m\n";
	return 0 === $fail;
}
