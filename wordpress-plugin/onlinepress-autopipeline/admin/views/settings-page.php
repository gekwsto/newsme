<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}
/**
 * @var array       $settings
 * @var array        $recent_runs
 * @var array|null    $last_success
 * @var array|null    $last_failed
 * @var int|false      $next_run
 * @var string          $seo_provider
 */
$option_name = OP_AUTOPIPELINE_OPTION_SETTINGS;
$seo_labels  = array(
	'yoast'     => 'Yoast SEO',
	'rank_math' => 'Rank Math',
	'none'      => __( 'None detected — using internal fallback meta', 'onlinepress-autopipeline' ),
);
?>
<div class="wrap onlinepress-autopipeline-wrap">
	<h1><?php esc_html_e( 'OnlinePress AutoPipeline', 'onlinepress-autopipeline' ); ?></h1>
	<p class="description">
		<?php esc_html_e( 'Imports processed, ready-to-publish articles from the NewsMe Article Processing Engine. NewsMe handles RSS discovery, AI rewriting, categorization and image selection — this plugin only imports and publishes.', 'onlinepress-autopipeline' ); ?>
	</p>

	<h2 class="nav-tab-wrapper">
		<a href="#op-settings" class="nav-tab nav-tab-active" data-tab="op-settings"><?php esc_html_e( 'Settings', 'onlinepress-autopipeline' ); ?></a>
		<a href="#op-status" class="nav-tab" data-tab="op-status"><?php esc_html_e( 'Status', 'onlinepress-autopipeline' ); ?></a>
	</h2>

	<div id="op-settings" class="op-tab-panel">
		<form method="post" action="options.php">
			<?php settings_fields( 'onlinepress_autopipeline_settings_group' ); ?>
			<table class="form-table" role="presentation">
				<tr>
					<th scope="row"><label for="op_api_url"><?php esc_html_e( 'NewsMe API URL', 'onlinepress-autopipeline' ); ?></label></th>
					<td>
						<input type="url" id="op_api_url" name="<?php echo esc_attr( $option_name ); ?>[api_url]" value="<?php echo esc_attr( $settings['api_url'] ); ?>" class="regular-text" placeholder="https://newsme.gr/api/integrations/wordpress/pipeline" required />
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="op_api_key"><?php esc_html_e( 'API Key', 'onlinepress-autopipeline' ); ?></label></th>
					<td>
						<input type="password" id="op_api_key" name="<?php echo esc_attr( $option_name ); ?>[api_key]" value="" class="regular-text" autocomplete="new-password" placeholder="<?php echo $settings['api_key'] ? esc_attr__( '•••••••• (leave blank to keep current key)', 'onlinepress-autopipeline' ) : ''; ?>" />
						<p class="description"><?php esc_html_e( 'Sent as an Authorization: Bearer header. Never displayed once saved.', 'onlinepress-autopipeline' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Enable Auto Pipeline', 'onlinepress-autopipeline' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $option_name ); ?>[enabled]" value="1" <?php checked( $settings['enabled'] ); ?> />
							<?php esc_html_e( 'Enabled', 'onlinepress-autopipeline' ); ?>
						</label>
						<p class="description"><?php esc_html_e( 'When off, scheduled runs are skipped. Manual "Run Now" still works so you can smoke-test the integration.', 'onlinepress-autopipeline' ); ?></p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="op_limit"><?php esc_html_e( 'Articles per run', 'onlinepress-autopipeline' ); ?></label></th>
					<td>
						<select id="op_limit" name="<?php echo esc_attr( $option_name ); ?>[limit]">
							<?php foreach ( array( 1, 5, 10, 20 ) as $value ) : ?>
								<option value="<?php echo esc_attr( $value ); ?>" <?php selected( (int) $settings['limit'], $value ); ?>><?php echo esc_html( $value ); ?></option>
							<?php endforeach; ?>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Import status', 'onlinepress-autopipeline' ); ?></th>
					<td>
						<select name="<?php echo esc_attr( $option_name ); ?>[import_status]">
							<option value="draft" <?php selected( $settings['import_status'], 'draft' ); ?>><?php esc_html_e( 'Draft', 'onlinepress-autopipeline' ); ?></option>
							<option value="publish" <?php selected( $settings['import_status'], 'publish' ); ?>><?php esc_html_e( 'Publish', 'onlinepress-autopipeline' ); ?></option>
						</select>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Schedule', 'onlinepress-autopipeline' ); ?></th>
					<td>
						<select name="<?php echo esc_attr( $option_name ); ?>[schedule]">
							<option value="manual" <?php selected( $settings['schedule'], 'manual' ); ?>><?php esc_html_e( 'Manual only', 'onlinepress-autopipeline' ); ?></option>
							<option value="op_autopipeline_15min" <?php selected( $settings['schedule'], 'op_autopipeline_15min' ); ?>><?php esc_html_e( 'Every 15 minutes', 'onlinepress-autopipeline' ); ?></option>
							<option value="op_autopipeline_30min" <?php selected( $settings['schedule'], 'op_autopipeline_30min' ); ?>><?php esc_html_e( 'Every 30 minutes', 'onlinepress-autopipeline' ); ?></option>
							<option value="hourly" <?php selected( $settings['schedule'], 'hourly' ); ?>><?php esc_html_e( 'Hourly', 'onlinepress-autopipeline' ); ?></option>
						</select>
						<p class="description"><?php esc_html_e( 'Each scheduled tick triggers a real NewsMe processing run (RSS discovery through AI rewriting), the same as "Run AutoPipeline Now" — it does not just poll for already-processed content. NewsMe\'s own daily article/budget limits still apply, and a database lock on the NewsMe side prevents overlapping runs.', 'onlinepress-autopipeline' ); ?></p>
						<p class="description">
							<?php
							if ( $next_run ) {
								printf(
									/* translators: %s: date/time of next scheduled run */
									esc_html__( 'Next scheduled run: %s', 'onlinepress-autopipeline' ),
									esc_html( get_date_from_gmt( gmdate( 'Y-m-d H:i:s', $next_run ), 'Y-m-d H:i:s' ) )
								);
							} else {
								esc_html_e( 'No run scheduled (manual only).', 'onlinepress-autopipeline' );
							}
							?>
						</p>
					</td>
				</tr>
				<tr>
					<th scope="row"><label for="op_default_author"><?php esc_html_e( 'Default Author', 'onlinepress-autopipeline' ); ?></label></th>
					<td>
						<?php
						wp_dropdown_users(
							array(
								'name'     => $option_name . '[default_author]',
								'id'       => 'op_default_author',
								'selected' => $settings['default_author'],
								'who'      => 'authors',
							)
						);
						?>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'Taxonomy creation', 'onlinepress-autopipeline' ); ?></th>
					<td>
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $option_name ); ?>[create_missing_categories]" value="1" <?php checked( $settings['create_missing_categories'] ); ?> />
							<?php esc_html_e( 'Create missing categories automatically', 'onlinepress-autopipeline' ); ?>
						</label><br />
						<label>
							<input type="checkbox" name="<?php echo esc_attr( $option_name ); ?>[create_missing_tags]" value="1" <?php checked( $settings['create_missing_tags'] ); ?> />
							<?php esc_html_e( 'Create missing tags automatically', 'onlinepress-autopipeline' ); ?>
						</label>
					</td>
				</tr>
				<tr>
					<th scope="row"><?php esc_html_e( 'SEO plugin detected', 'onlinepress-autopipeline' ); ?></th>
					<td><?php echo esc_html( isset( $seo_labels[ $seo_provider ] ) ? $seo_labels[ $seo_provider ] : $seo_provider ); ?></td>
				</tr>
			</table>
			<?php submit_button(); ?>
		</form>

		<hr />
		<h2><?php esc_html_e( 'Run AutoPipeline Now', 'onlinepress-autopipeline' ); ?></h2>
		<p class="description"><?php esc_html_e( 'Forces a fresh NewsMe generation cycle and imports whatever comes back. Safe to click repeatedly — already-imported articles are skipped.', 'onlinepress-autopipeline' ); ?></p>
		<button type="button" class="button button-primary" id="op-run-now"><?php esc_html_e( 'Run AutoPipeline Now', 'onlinepress-autopipeline' ); ?></button>
		<span id="op-run-now-spinner" class="spinner" style="float:none;"></span>
		<div id="op-run-now-result"></div>
	</div>

	<div id="op-status" class="op-tab-panel" style="display:none;">
		<h2><?php esc_html_e( 'Status', 'onlinepress-autopipeline' ); ?></h2>
		<table class="widefat striped">
			<tbody>
				<tr>
					<th><?php esc_html_e( 'Last successful run', 'onlinepress-autopipeline' ); ?></th>
					<td><?php echo $last_success ? esc_html( $last_success['finished_at'] ) : esc_html__( '—', 'onlinepress-autopipeline' ); ?></td>
				</tr>
				<tr>
					<th><?php esc_html_e( 'Last failed run', 'onlinepress-autopipeline' ); ?></th>
					<td><?php echo $last_failed ? esc_html( $last_failed['finished_at'] . ' — ' . $last_failed['error'] ) : esc_html__( '—', 'onlinepress-autopipeline' ); ?></td>
				</tr>
			</tbody>
		</table>

		<h3><?php esc_html_e( 'Recent runs', 'onlinepress-autopipeline' ); ?></h3>
		<table class="widefat striped">
			<thead>
				<tr>
					<th><?php esc_html_e( 'Started', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Trigger', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Status', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Received', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Imported', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Published', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Skipped', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Failed', 'onlinepress-autopipeline' ); ?></th>
					<th><?php esc_html_e( 'Image failures', 'onlinepress-autopipeline' ); ?></th>
				</tr>
			</thead>
			<tbody>
				<?php if ( empty( $recent_runs ) ) : ?>
					<tr><td colspan="9"><?php esc_html_e( 'No runs yet.', 'onlinepress-autopipeline' ); ?></td></tr>
				<?php else : ?>
					<?php foreach ( $recent_runs as $run ) : ?>
						<tr>
							<td><?php echo esc_html( $run['started_at'] ); ?></td>
							<td><?php echo esc_html( $run['trigger'] ); ?></td>
							<td><?php echo esc_html( $run['status'] ); ?></td>
							<td><?php echo esc_html( $run['received'] ); ?></td>
							<td><?php echo esc_html( $run['imported'] ); ?></td>
							<td><?php echo esc_html( $run['published'] ); ?></td>
							<td><?php echo esc_html( $run['skipped'] ); ?></td>
							<td><?php echo esc_html( $run['failed'] ); ?></td>
							<td><?php echo esc_html( $run['image_failures'] ); ?></td>
						</tr>
					<?php endforeach; ?>
				<?php endif; ?>
			</tbody>
		</table>
	</div>
</div>
