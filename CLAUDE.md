# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

CC Sessions is a Tauri v2 desktop app for browsing and managing Claude Code session files. It scans `~/.claude/projects/` for `.jsonl` session files and provides a GTD-style workflow (status tracking, tagging, starring) for organizing them.

## Development Commands

```bash
pnpm dev              # Vite dev server (frontend only, port 5173)
pnpm tauri dev        # Full Tauri dev (Rust + frontend, runs pnpm dev automatically)
pnpm build            # Vite production build (frontend only)
pnpm tauri build      # Full production build (creates native app bundle)
```

There are no tests or linter configured.

## Architecture

**Three-panel layout**: Sidebar (filters/tags) | SessionList | DetailPanel, all in `src/renderer/components/`.

### Backend (Rust) — `src-tauri/src/lib.rs`

Single file containing all Tauri commands and the full session parsing logic:
- `scan_sessions` — walks `~/.claude/projects/`, parses every `.jsonl` file, extracts metadata (title, messages, timestamps, git branch, etc.)
- `load_gtd_store` / `save_gtd_store` — CRUD for a JSON-based GTD store at `$APPDATA/gtd-store.json`
- `read_session_content` — returns raw JSONL content of a session
- `delete_session` — removes a session file
- `restore_session` — opens macOS Terminal with `claude --resume <session_id>` via AppleScript

Rust struct types (`SessionInfo`, `GtdMetadata`, `AppStore`) are camelCase-serialized to mirror the TypeScript types in `src/shared/types/index.ts`. Keep these in sync.

### Frontend (React/TypeScript) — `src/renderer/`

- **State management**: Single `useStore` hook (`hooks/useStore.ts`) — all app state, Tauri invocations, and GTD persistence logic. No external state library.
- **Types**: Shared between frontend and backend via `src/shared/types/index.ts`.
- **Styling**: Tailwind v4 with a custom theme system using CSS variables in `index.css`. Dark/light/system theme support. Radix UI primitives for complex components, Lucide for icons.
- **Path alias**: `@/` maps to `./src/` (configured in both `vite.config.ts` and `tsconfig.json`).
- **Markdown rendering**: `react-markdown` + `rehype-highlight` + `remark-gfm` for session content display.

### Key data flow

1. On load, `useStore` calls `scan_sessions` and `load_gtd_store` in parallel
2. GTD changes (status, tags, notes, starred) are immediately persisted to `gtd-store.json` via `save_gtd_store`
3. Session content is loaded on-demand when a session is selected
4. The `restore_session` command is macOS-specific (uses `osascript`)

### Tauri capabilities

Defined in `src-tauri/capabilities/default.json` — filesystem access is scoped to `$HOME/.claude/**` for reads and `$APPDATA/**` for writes.
