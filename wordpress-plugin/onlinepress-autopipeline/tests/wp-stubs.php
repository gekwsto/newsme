<?php
/**
 * Minimal WordPress function/class stubs so the plugin's PHP classes can be
 * unit-tested without a full WordPress install, database, or Composer/
 * PHPUnit dependency tree. Only implements the subset of the WP API the
 * plugin actually calls — not a general-purpose WP test framework.
 */

define( 'ABSPATH', __DIR__ . '/fixtures/' );
define( 'MINUTE_IN_SECONDS', 60 );
define( 'WPINC', 'wp-includes' );

$GLOBALS['__wp_options']       = array();
$GLOBALS['__wp_terms']         = array();
$GLOBALS['__wp_posts']         = array();
$GLOBALS['__wp_postmeta']      = array();
$GLOBALS['__wp_post_terms']    = array();
$GLOBALS['__wp_thumbnails']    = array();
$GLOBALS['__wp_transients']    = array();
$GLOBALS['__wp_cron']          = array();
$GLOBALS['__wp_http_queue']    = array();
$GLOBALS['__wp_http_calls']    = array();
$GLOBALS['__wp_next_post_id']  = 1;
$GLOBALS['__wp_next_term_id']  = 1000;
$GLOBALS['__media_sideload_queue'] = array();
$GLOBALS['__wp_attachment_mime'] = array();

class WP_Error {
	private $code;
	private $message;
	public function __construct( $code = '', $message = '' ) {
		$this->code    = $code;
		$this->message = $message;
	}
	public function get_error_code() {
		return $this->code;
	}
	public function get_error_message() {
		return $this->message;
	}
}

class WP_Term {
	public $term_id;
	public $name;
	public $slug;
	public function __construct( $term_id, $name, $slug ) {
		$this->term_id = $term_id;
		$this->name    = $name;
		$this->slug    = $slug;
	}
}

function is_wp_error( $thing ) {
	return $thing instanceof WP_Error;
}

// ── Options ─────────────────────────────────────────────────────────────

function get_option( $name, $default = false ) {
	return array_key_exists( $name, $GLOBALS['__wp_options'] ) ? $GLOBALS['__wp_options'][ $name ] : $default;
}
function add_option( $name, $value ) {
	if ( ! array_key_exists( $name, $GLOBALS['__wp_options'] ) ) {
		$GLOBALS['__wp_options'][ $name ] = $value;
	}
	return true;
}
function update_option( $name, $value, $autoload = null ) {
	$GLOBALS['__wp_options'][ $name ] = $value;
	return true;
}
function delete_option( $name ) {
	unset( $GLOBALS['__wp_options'][ $name ] );
	return true;
}

// ── Sanitization / i18n helpers (real WordPress behaviour, simplified) ────

function sanitize_text_field( $str ) {
	return trim( wp_strip_all_tags( (string) $str ) );
}
function sanitize_textarea_field( $str ) {
	return trim( (string) $str );
}
function wp_strip_all_tags( $str ) {
	return trim( strip_tags( (string) $str ) );
}
function sanitize_title( $str ) {
	$str = strtolower( trim( (string) $str ) );
	$str = preg_replace( '/[^a-z0-9]+/', '-', $str );
	return trim( $str, '-' );
}
function sanitize_key( $str ) {
	return strtolower( preg_replace( '/[^a-z0-9_\-]/', '', (string) $str ) );
}
function absint( $n ) {
	return abs( (int) $n );
}
function esc_url_raw( $url ) {
	return $url;
}
function esc_attr( $s ) {
	return $s;
}
function esc_html( $s ) {
	return $s;
}
function __( $s, $domain = null ) {
	return $s;
}
function esc_html__( $s, $domain = null ) {
	return $s;
}
function esc_attr__( $s, $domain = null ) {
	return $s;
}
function esc_html_e( $s, $domain = null ) {
	echo $s;
}
function untrailingslashit( $s ) {
	return rtrim( $s, '/' );
}
function wp_json_encode( $data ) {
	return json_encode( $data );
}
function current_time( $type ) {
	return gmdate( 'Y-m-d H:i:s' );
}
function wp_generate_uuid4() {
	return 'uuid-' . bin2hex( random_bytes( 8 ) );
}
function get_current_user_id() {
	return 1;
}
function get_userdata( $id ) {
	return $id ? (object) array( 'ID' => $id ) : false;
}
function wp_http_validate_url( $url ) {
	return false !== filter_var( $url, FILTER_VALIDATE_URL );
}
function wp_kses_post( $html ) {
	return $html;
}
function wp_parse_args( $args, $defaults = array() ) {
	if ( is_object( $args ) ) {
		$args = get_object_vars( $args );
	}
	return array_merge( $defaults, (array) $args );
}

// ── Terms (categories / tags) ──────────────────────────────────────────

function get_term_by( $field, $value, $taxonomy ) {
	foreach ( $GLOBALS['__wp_terms'][ $taxonomy ] ?? array() as $term ) {
		if ( $term->$field === $value ) {
			return $term;
		}
	}
	return false;
}
function wp_insert_term( $name, $taxonomy, $args = array() ) {
	$slug = $args['slug'] ?? sanitize_title( $name );
	$id   = $GLOBALS['__wp_next_term_id']++;
	$term = new WP_Term( $id, $name, $slug );
	$GLOBALS['__wp_terms'][ $taxonomy ][] = $term;
	return array(
		'term_id'          => $id,
		'term_taxonomy_id' => $id,
	);
}
function wp_set_post_terms( $post_id, $terms, $taxonomy ) {
	$GLOBALS['__wp_post_terms'][ $post_id ][ $taxonomy ] = $terms;
	return $terms;
}

// ── Posts / postmeta / attachments ─────────────────────────────────────

function wp_insert_post( $postarr, $wp_error = false ) {
	$id                            = $GLOBALS['__wp_next_post_id']++;
	$GLOBALS['__wp_posts'][ $id ]  = $postarr;
	if ( isset( $postarr['meta_input'] ) ) {
		foreach ( $postarr['meta_input'] as $key => $value ) {
			$GLOBALS['__wp_postmeta'][ $id ][ $key ] = $value;
		}
	}
	return $id;
}
function wp_update_post( $args ) {
	$id                           = $args['ID'];
	$GLOBALS['__wp_posts'][ $id ] = array_merge( $GLOBALS['__wp_posts'][ $id ] ?? array(), $args );
	return $id;
}
function get_posts( $args ) {
	$out = array();
	foreach ( $GLOBALS['__wp_posts'] as $id => $post ) {
		if ( isset( $args['meta_key'] ) ) {
			$meta = $GLOBALS['__wp_postmeta'][ $id ][ $args['meta_key'] ] ?? null;
			if ( $meta !== $args['meta_value'] ) {
				continue;
			}
		}
		$out[] = $id;
	}
	$limit = $args['posts_per_page'] ?? -1;
	return $limit > 0 ? array_slice( $out, 0, $limit ) : $out;
}
function update_post_meta( $post_id, $key, $value ) {
	$GLOBALS['__wp_postmeta'][ $post_id ][ $key ] = $value;
	return true;
}
function get_post_meta( $post_id, $key, $single = false ) {
	return $GLOBALS['__wp_postmeta'][ $post_id ][ $key ] ?? '';
}
function get_permalink( $post_id ) {
	return 'https://onlinepress.gr/?p=' . $post_id;
}
function get_post_status( $post_id ) {
	return $GLOBALS['__wp_posts'][ $post_id ]['post_status'] ?? false;
}
function get_post_mime_type( $attachment_id ) {
	return $GLOBALS['__wp_attachment_mime'][ $attachment_id ] ?? 'image/jpeg';
}
function wp_delete_attachment( $attachment_id, $force_delete = false ) {
	unset( $GLOBALS['__wp_posts'][ $attachment_id ] );
	return true;
}
function set_post_thumbnail( $post_id, $attachment_id ) {
	$GLOBALS['__wp_thumbnails'][ $post_id ] = $attachment_id;
	return true;
}

/**
 * Pre-defining this makes function_exists('media_sideload_image') true in
 * class-image-handler.php, so it never tries to require the real
 * wp-admin/includes/*.php files (which don't exist in this stub environment).
 * Tests control its return value via $GLOBALS['__media_sideload_queue'].
 */
function media_sideload_image( $url, $post_id, $desc, $return_type = 'html' ) {
	if ( ! empty( $GLOBALS['__media_sideload_queue'] ) ) {
		return array_shift( $GLOBALS['__media_sideload_queue'] );
	}
	$id = $GLOBALS['__wp_next_post_id']++;
	$GLOBALS['__wp_attachment_mime'][ $id ] = 'image/jpeg';
	return $id;
}

// ── Transients (used for the cron lock) ────────────────────────────────

function get_transient( $key ) {
	return $GLOBALS['__wp_transients'][ $key ] ?? false;
}
function set_transient( $key, $value, $ttl = 0 ) {
	$GLOBALS['__wp_transients'][ $key ] = $value;
	return true;
}
function delete_transient( $key ) {
	unset( $GLOBALS['__wp_transients'][ $key ] );
	return true;
}

// ── Cron ────────────────────────────────────────────────────────────────

function wp_next_scheduled( $hook ) {
	return $GLOBALS['__wp_cron'][ $hook ] ?? false;
}
function wp_schedule_event( $timestamp, $recurrence, $hook ) {
	$GLOBALS['__wp_cron'][ $hook ] = $timestamp;
	return true;
}
function wp_unschedule_event( $timestamp, $hook ) {
	unset( $GLOBALS['__wp_cron'][ $hook ] );
	return true;
}

// ── HTTP API (queue-driven for deterministic tests) ────────────────────

function wp_remote_post( $url, $args = array() ) {
	$GLOBALS['__wp_http_calls'][] = array( 'url' => $url, 'args' => $args, 'method' => 'POST' );
	if ( empty( $GLOBALS['__wp_http_queue'] ) ) {
		return new WP_Error( 'op_test_no_response_queued', 'No mocked HTTP response was queued.' );
	}
	return array_shift( $GLOBALS['__wp_http_queue'] );
}
function wp_remote_get( $url, $args = array() ) {
	$GLOBALS['__wp_http_calls'][] = array( 'url' => $url, 'args' => $args, 'method' => 'GET' );
	if ( empty( $GLOBALS['__wp_http_queue'] ) ) {
		return new WP_Error( 'op_test_no_response_queued', 'No mocked HTTP response was queued.' );
	}
	return array_shift( $GLOBALS['__wp_http_queue'] );
}
function wp_remote_retrieve_response_code( $response ) {
	return $response['response']['code'] ?? 0;
}
function wp_remote_retrieve_body( $response ) {
	return $response['body'] ?? '';
}

// ── Plugin bootstrap no-ops (hooks we don't need to actually fire in unit tests) ─

/**
 * Pre-defined here (loaded before the real plugin file) so the real
 * onlinepress_autopipeline_sleep()'s function_exists() guard skips
 * redefining it — the scheduler's poll loop calls this instead of a bare
 * sleep(), so tests run instantly instead of pausing for real seconds.
 */
function onlinepress_autopipeline_sleep( $seconds ) {}

function add_action( ...$args ) {}
function add_filter( $tag, $callback, ...$rest ) {
	return $callback;
}
function register_activation_hook( ...$args ) {}
function register_deactivation_hook( ...$args ) {}
function load_plugin_textdomain( ...$args ) {}
function is_admin() {
	return false;
}
function plugin_dir_path( $file ) {
	return rtrim( dirname( $file ), '/' ) . '/';
}
function plugin_dir_url( $file ) {
	return 'https://onlinepress.gr/wp-content/plugins/onlinepress-autopipeline/';
}
function plugin_basename( $file ) {
	return basename( dirname( $file ) ) . '/' . basename( $file );
}
