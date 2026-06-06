# Changelog

All notable changes to CC Sessions are documented here.

## [1.0.1] - 2026-06-06

### Fixed

- Enabled Tauri updater artifact generation so release builds include signed updater metadata.
- Stabilized CI by avoiding platform-dependent date formatting in frontend tests.
- Stabilized Rust persistence tests by making temporary test paths unique within each test process.
- Simplified the release workflow to rely on Tauri's native updater metadata generation.

### Notes

- This release is intended to validate in-app updates from v1.0.0 to v1.0.1.

## [1.0.0] - 2026-06-05

### Added

- Browse Claude Code and Codex CLI sessions from a native Tauri desktop app.
- View full conversations with Markdown rendering, syntax highlighting, collapsible tool calls, and session metadata.
- Search session metadata and indexed conversation content.
- Organize sessions with GTD status, tags, notes, starring, saved messages, and archived-session bulk actions.
- Resume supported sessions through the matching CLI.
- Check for signed GitHub release updates from the app and install them in place.
- Build and test with GitHub Actions, including signed release artifacts and updater metadata.

### Notes

- This is the first public release. Future versions can update from this build through the in-app updater.
