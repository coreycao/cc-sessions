# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CC Sessions is a Tauri v2 desktop app for browsing and managing Claude Code session files. It scans `~/.claude/projects/` for `.jsonl` session files and provides a GTD-style workflow (status tracking, tagging, starring) plus full-text search, saved messages, batch operations, and markdown export.

## Development Commands

```bash
pnpm dev              # Vite dev server (frontend only, port 5173)
pnpm tauri dev        # Full Tauri dev (Rust + frontend, runs pnpm dev automatically)
pnpm build            # Vite production build (frontend only)
pnpm tauri build      # Full production build (creates native app bundle)
pnpm test             # Run both frontend and Rust tests
pnpm test:frontend    # Vitest only
pnpm test:rust        # Cargo test only
```

No linter is configured.

## Architecture

**Three-panel layout**: Sidebar (filters/tags/stats) | SessionList | DetailPanel, all in `src/renderer/components/`.

### Backend (Rust) — `src-tauri/src/`

Modularized by domain (no longer a single file):

- **`lib.rs`** — App setup, plugin initialization, file watcher, background index building
- **`commands.rs`** — IPC commands with path validation: `read_session_content`, `delete_session`, `restore_session`, `export_markdown`
- **`scanner.rs`** — Session file parsing, metadata caching (`session-cache.json`), incremental index updates, `scan_sessions`, `search_session_content`, `is_index_ready`
- **`gtd.rs`** — GTD state management: `load_gtd_store`, `save_gtd_store`
- **`saved.rs`** — Saved messages: `load_saved_messages`, `save_saved_messages`
- **`search_index.rs`** — Tantivy-based full-text search with field boosting (user messages 3×, assistant 1×, tools 0.5×)
- **`models.rs`** — All data structures: `SessionInfo`, `GtdMetadata`, `AppStore`, `SavedMessage`, `SavedMessagesStore`, `ContentSearchResult`, `SessionCacheEntry`, `SessionCache`
- **`helpers.rs`** — Utility functions: path resolution, project name inference, text extraction, snippet generation

Rust struct types are camelCase-serialized to mirror the TypeScript types in `src/shared/types/index.ts`. Keep these in sync.

### Frontend (React/TypeScript) — `src/renderer/`

- **State management**: `useStore` hook (`hooks/useStore.ts`) orchestrates all app state, delegating to domain hooks:
  - `useSessions` — session loading and scanning
  - `useGTD` — status, tags, notes, starred
  - `useFilters` — search, status/project/tag filters
  - `useContentSearch` — full-text content search via Tantivy
  - `useSavedMessages` — cross-session message bookmarking
  - `useToast` — toast notifications
- **Types**: Shared between frontend and backend via `src/shared/types/index.ts`. Includes `ConversationMessage` variants (`TextMessage`, `ThinkingMessage`, `ToolUseMessage`, `SystemMessage`) and `ConversationTurn` variants (`AssistantTurn`, `UserTextTurn`).
- **Styling**: Tailwind v4 with a custom theme system using CSS variables in `index.css`. Dark/light/system theme support. Lucide for icons.
- **Path alias**: `@/` maps to `./src/` (configured in both `vite.config.ts` and `tsconfig.json`).
- **Markdown rendering**: `react-markdown` + `rehype-highlight` + `remark-gfm` for session content display.
- **Parsing**: `lib/parseConversation.ts` converts raw JSONL into structured turns with tool results and thinking blocks.

### Key data flow

1. On load, `useStore` calls `scan_sessions` (uses cached metadata for fast startup) and `load_gtd_store` in parallel
2. A file watcher monitors `~/.claude/projects/` and triggers incremental rescans on changes
3. Tantivy search index builds in the background; content search queries go through `search_session_content`
4. GTD changes (status, tags, notes, starred) are immediately persisted to `gtd-store.json` via `save_gtd_store`
5. Session content is loaded on-demand when a session is selected
6. Batch operations (delete, status change) act on multiple selected sessions
7. The `restore_session` command is macOS-specific (uses `osascript`)

### Tauri capabilities

Defined in `src-tauri/capabilities/default.json` — filesystem access is scoped to `$HOME/.claude/**` for reads and `$APPDATA/**` for writes.

## CI/CD

- **CI** (`.github/workflows/ci.yml`): Runs on push/PR to master — builds frontend, runs `pnpm test:frontend` and `pnpm test:rust`
- **Release** (`.github/workflows/release.yml`): Multi-platform builds (macOS, Linux, Windows) with auto-updater JSON upload to GitHub releases
