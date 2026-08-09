=== OnlinePress AutoPipeline ===
Contributors: onlinepress
Tags: news, automation, import, newsme
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

Imports fully processed, ready-to-publish articles from the NewsMe Article Processing Engine into WordPress.

== Description ==

NewsMe (https://newsme.gr) is the source of truth for RSS discovery, article extraction, AI rewriting, categorization, and image selection. This plugin is a thin publishing client: it authenticates to the NewsMe integration API, pulls normalized articles, and creates WordPress posts with categories, tags, a real Media Library featured image, and SEO metadata (Yoast / Rank Math / internal fallback).

No AI logic, RSS parsing, or image-selection logic lives in this plugin — see the NewsMe repository's `src/services/news-auto-pipeline.ts` and `src/app/api/integrations/wordpress/pipeline/route.ts` for that.

== Installation ==

1. Upload the `onlinepress-autopipeline` folder to `/wp-content/plugins/`.
2. Activate the plugin through the "Plugins" screen.
3. Go to "OnlinePress AutoPipeline" in the wp-admin menu.
4. Enter the NewsMe API URL and API key.
5. Choose import status (draft/publish) and schedule.
6. Check "Enable Auto Pipeline" and save.
7. Click "Run AutoPipeline Now" to smoke-test.

== Changelog ==

= 1.0.0 =
* Initial release.
