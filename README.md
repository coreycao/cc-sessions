# CC Sessions

A desktop app for browsing and managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) and Codex CLI session files. Built with Tauri v2 + React.

![macOS](https://img.shields.io/badge/platform-macOS-black)

## Features

- **Session browser** — Scans `~/.claude/projects/` and `~/.codex/sessions/`, then lists local Claude Code and Codex CLI sessions with source badges, project metadata, git branch, message count, timestamps, and fast virtualized lists.
- **Conversation viewer** — Structured rendering of full conversations with Markdown support, syntax highlighting, collapsible tool calls, thinking blocks, system messages, and virtualized detail rendering for long sessions.
- **Full-text search** — Two-tier search: instant local metadata filtering plus debounced content search across user messages, assistant responses, tool input/output, with relevance scoring and snippet previews.
- **Local organization** — Track sessions with New / Archived, tags, notes, stars, saved messages, custom display titles, and batch actions without modifying the original Claude Code or Codex session files.
- **Project management** — Archive quiet projects, add local project notes, choose project icons, sort/filter project lists, and hide archived projects and their sessions from the main browser.
- **AI workflows** — Add OpenAI-compatible LLM providers, test connectivity, review a session, suggest tags, rename a session, or batch-generate session titles. AI review results are cached when the session content has not changed.
- **Settings dashboard** — Manage App, AI, Appearance, Projects, Statistics, and Data pages, including storage usage, index/cache statistics, manual session sync, and AI review cache stats.
- **App updates** — Check for signed GitHub release updates from Settings or the app header, download updates in-app, then restart when ready. Dev builds include local updater mock modes for testing update states.
- **Persistent cache** — Session metadata and search indexes are cached to disk and incrementally updated, avoiding full JSONL re-parsing on every launch.
- **Theme and language** — Light / Dark / System theme support with English and Chinese UI.

## Prerequisites

- [Node.js](https://nodejs.org/) >= 20.19 (Node 24 is used in CI)
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI and/or Codex CLI (for session resume features)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start development mode
pnpm tauri dev
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start Vite dev server (frontend only) |
| `pnpm tauri dev` | Start full Tauri dev mode (Rust + frontend with HMR) |
| `pnpm build` | Build frontend for production |
| `pnpm tauri build` | Build native app bundle (.dmg on macOS) |
| `pnpm test` | Run frontend Vitest tests and Rust Cargo tests |
| `pnpm release <version>` | Sync app versions, test, commit, tag, and push a release |
| `pnpm updater:e2e:local` | Run the local updater mock flow for development testing |

## Release Updates

Releases are built by `.github/workflows/release.yml` when pushing a `v*` tag. The workflow uploads native bundles plus `latest.json`, which the app checks at:

```text
https://github.com/coreycao/cc-sessions/releases/latest/download/latest.json
```

Set these GitHub repository secrets before publishing update-enabled releases:

| Secret | Value |
|--------|-------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contents of the local updater private key |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Private key password, or empty for the generated passwordless key |

The checked-in updater public key lives in `src-tauri/tauri.conf.json`. Keep private keys out of git.

Once the secret exists, use the release script for normal releases:

```bash
pnpm release 1.0.1
```

This updates `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, and `src-tauri/Cargo.lock`, runs the test suite, commits `Release v1.0.1`, creates the `v1.0.1` tag, and pushes the branch and tag. The tag triggers GitHub Actions to build the release and upload `latest.json`.

Release notes are read from `docs/releases/vX.Y.Z.md` and copied into the GitHub draft release. See `docs/release.md` for the full branching and release checklist.

Useful variants:

```bash
pnpm release 1.0.1 --setup-secret  # Upload .tauri-keys/updater.key first
pnpm release 1.0.1 --no-push       # Prepare the commit and tag locally
pnpm release 1.0.1 --dry-run       # Preview the workflow
```

## Architecture

```
src/
├── renderer/              # React frontend
│   ├── App.tsx            # Root component — three-panel layout
│   ├── components/        # UI components
│   │   ├── Sidebar.tsx    # Filters (All/New/Starred/Archived), tags, stats
│   │   ├── SessionList.tsx
│   │   ├── DetailPanel.tsx
│   │   ├── BatchActions.tsx
│   │   ├── SettingsPanel.tsx
│   │   ├── SavedMessagesList.tsx
│   │   ├── ConversationMessage.tsx  # Structured conversation rendering
│   │   ├── ProjectIcon.tsx
│   │   └── Toast.tsx
│   ├── hooks/             # State & logic hooks
│   │   ├── useStore.ts    # Root store (composition)
│   │   ├── useSessions.ts
│   │   ├── useGTD.ts
│   │   ├── useSavedMessages.ts
│   │   ├── useAiSettings.ts
│   │   ├── useFilters.ts
│   │   ├── useContentSearch.ts  # Full-text content search
│   │   └── useToast.ts
│   └── lib/
│       ├── parseConversation.ts  # JSONL → structured conversation turns
│       ├── aiSessionContext.ts   # Compact transcript context for AI features
│       ├── aiReviewCache.ts
│       ├── updater.ts
│       ├── i18n.tsx
│       └── utils.ts
└── shared/types/          # Shared TypeScript types (mirrored in Rust)

src-tauri/src/
├── lib.rs                 # App entry — module registration & Tauri setup
├── models.rs              # Data structures (SessionInfo, GtdMetadata, AppStore)
├── ai.rs                  # OpenAI-compatible AI settings and chat-completion calls
├── helpers.rs             # Utility functions (path resolution, text extraction)
├── scanner.rs             # JSONL session file parsing with disk cache
├── gtd.rs                 # GTD state management (in-memory + disk persistence)
├── saved.rs               # Saved message persistence
├── search_index.rs        # Search index persistence and incremental updates
└── commands.rs            # Tauri IPC commands (with path validation)
```

**Frontend** — React 19, TypeScript, Tailwind v4, TanStack Virtual, Lucide icons, react-markdown + remark-gfm + rehype-highlight

**Backend** — Rust, Tauri v2, serde, tokio, reqwest. The GTD/project store is held in memory via `tauri::State<Mutex<AppStore>>` and persisted to `$APPDATA/gtd-store.json` on every mutation. Session metadata and content search indexes are cached to `$APPDATA/session-cache.json` and `$APPDATA/search-index.json` for fast startup.

**Communication** — Frontend calls Rust through `invoke()` IPC. Filesystem access is scoped to `$HOME/.claude/projects/**`, `$HOME/.codex/sessions/**`, and `$APPDATA/**`.

**Local-first data** — CC Sessions stores its own tags, notes, stars, custom titles, project metadata, saved messages, AI settings, and caches under the app data directory. Display titles, project notes, and project icons are local to CC Sessions and do not rewrite Claude Code or Codex session files.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Focus search |
| `⌘B` | Toggle sidebar |
| `⌘,` | Open Settings |
| `Esc` | Deselect session |
| `↑` `↓` | Navigate session list |

## Data & Privacy

CC Sessions reads local Claude Code and Codex session files and writes its own app data under the Tauri app data directory. AI provider profiles are saved locally in `ai-settings.json`; API keys are never committed by the app, but they are stored as local app data rather than in the system keychain. AI features send compact session context to the configured OpenAI-compatible provider only when you explicitly run an AI action.

## License

MIT
