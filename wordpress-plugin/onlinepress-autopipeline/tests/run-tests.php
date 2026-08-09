<?php
/**
 * Usage: php tests/run-tests.php
 * No Composer/PHPUnit required — see framework.php.
 */

require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/framework.php';

$suites = array(
	'test-settings.php',
	'test-category-mapper.php',
	'test-api-client.php',
	'test-importer.php',
	'test-scheduler.php',
);

foreach ( $suites as $suite ) {
	echo "\n" . $suite . "\n";
	require __DIR__ . '/' . $suite;
}

$ok = print_summary();
exit( $ok ? 0 : 1 );
