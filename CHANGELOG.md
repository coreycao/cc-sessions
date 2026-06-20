# Changelog

All notable changes to CC Sessions are documented here.

## [1.0.11] - 2026-06-20

### Added

- Add project open actions in Settings → Projects for Finder, Terminal, VS Code, and Xcode.
- Add status filtering to the batch AI rename dialog, with skipped sessions hidden by default.

### Changed

- Remove the left sidebar Stats panel while keeping the full Statistics settings page.
- Refresh README documentation for AI workflows, project management, updater testing, local data, and current prerequisites.
- Polish AI rename and review loading/status indicators.

## [1.0.0] - 2026-06-08

### Added

- Browse Claude Code and Codex CLI sessions from a native Tauri desktop app.
- View full conversations with Markdown rendering, syntax highlighting, collapsible tool calls, and session metadata.
- Search session metadata and indexed conversation content.
- Organize sessions with GTD status, tags, notes, starring, saved messages, and archived-session bulk actions.
- Resume supported sessions through the matching CLI.
- Check for signed GitHub release updates from the app and install them in place.
- Show visible update-check status and retry guidance when release metadata is slow or unreachable.
- Build and test with GitHub Actions, including signed release artifacts and updater metadata.
- Publish native macOS builds for Intel and Apple Silicon.
- Display the runtime app version in settings.
- Download and prepare updates first, then let the user explicitly restart to finish installation.

### Notes

- This is the first public macOS release. Linux and Windows builds are intentionally not published yet.
