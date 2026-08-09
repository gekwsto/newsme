/* global jQuery, OPAutoPipeline */
( function ( $ ) {
	'use strict';

	$( function () {
		$( '.nav-tab' ).on( 'click', function ( e ) {
			e.preventDefault();
			var tab = $( this ).data( 'tab' );
			$( '.nav-tab' ).removeClass( 'nav-tab-active' );
			$( this ).addClass( 'nav-tab-active' );
			$( '.op-tab-panel' ).hide();
			$( '#' + tab ).show();
		} );

		var $button  = $( '#op-run-now' );
		var $spinner = $( '#op-run-now-spinner' );
		var $result  = $( '#op-run-now-result' );
		var elapsedTimer = null;

		function startElapsedTimer() {
			var startedAt = Date.now();
			elapsedTimer = window.setInterval( function () {
				var seconds = Math.round( ( Date.now() - startedAt ) / 1000 );
				$button.text( OPAutoPipeline.i18n.running + ' (' + seconds + 's)' );
			}, 1000 );
		}

		function stopElapsedTimer() {
			if ( elapsedTimer ) {
				window.clearInterval( elapsedTimer );
				elapsedTimer = null;
			}
		}

		$button.on( 'click', function () {
			// The server-side lock (NewsMe's PipelineLock + this plugin's own
			// transient) is the real protection against a duplicate run; this
			// disabled state is just to stop an accidental double-click from
			// queueing a second admin-ajax request while one is in flight.
			if ( $button.prop( 'disabled' ) ) {
				return;
			}

			$button.prop( 'disabled', true );
			startElapsedTimer();
			$spinner.addClass( 'is-active' );
			$result.html( '<div class="notice notice-info inline"><p>' + OPAutoPipeline.i18n.longRunNotice + '</p></div>' );

			$.post( OPAutoPipeline.ajaxUrl, {
				action: 'onlinepress_autopipeline_run_now',
				nonce: OPAutoPipeline.nonce,
			} )
				.done( function ( response ) {
					if ( ! response.success ) {
						$result.html( '<div class="notice notice-error inline"><p>' + ( response.data && response.data.message ? response.data.message : 'Unknown error' ) + '</p></div>' );
						return;
					}

					var data = response.data || {};

					if ( 'skipped' === data.status ) {
						// Not an error — another run (this site's own lock) is
						// already in progress. Human-readable, no stack trace.
						$result.html( '<div class="notice notice-warning inline"><p>' + ( data.message || 'Another run is already in progress.' ) + '</p></div>' );
						return;
					}

					var stats = data.stats || {};
					$result.html(
						'<div class="notice notice-success inline"><p>' +
							'Imported: ' + ( stats.imported || 0 ) +
							', Published: ' + ( stats.published || 0 ) +
							', Skipped: ' + ( stats.skipped || 0 ) +
							', Failed: ' + ( stats.failed || 0 ) +
							', Image failures: ' + ( stats.image_failures || 0 ) +
							'</p></div>'
					);
				} )
				.fail( function () {
					$result.html( '<div class="notice notice-error inline"><p>Request failed or timed out. If a fresh generation cycle is still running on NewsMe, check the Status tab shortly — the run may still complete server-side.</p></div>' );
				} )
				.always( function () {
					stopElapsedTimer();
					$button.prop( 'disabled', false ).text( OPAutoPipeline.i18n.runNow );
					$spinner.removeClass( 'is-active' );
				} );
		} );
	} );
} )( jQuery );
