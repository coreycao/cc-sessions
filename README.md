# CC Sessions

A desktop app for browsing and managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session files. Built with Tauri v2 + React.

![macOS](https://img.shields.io/badge/platform-macOS-black)

## Features

- **Session browser** — Scans `~/.claude/projects/` and lists all your Claude Code sessions with metadata (title, project, git branch, message count, timestamps)
- **GTD workflow** — Organize sessions with status tracking (Inbox / Todo / In Progress / Waiting / Done / Archived), tags, and starring
- **Conversation preview** — View full conversation content with Markdown rendering and syntax highlighting
- **Session management** — Delete sessions or resume them directly in Terminal via `claude --resume`
- **Filtering & search** — Filter by project, status, tag, or keyword; keyboard shortcuts for quick navigation
- **Dark mode** — Light / Dark / System theme support

## Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/)
- [Rust](https://www.rust-lang.org/tools/install) (stable toolchain)
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI (for session resume feature)

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

## Architecture

```
src/
├── renderer/           # React frontend
│   ├── App.tsx         # Root component — three-panel layout
│   ├── components/     # Sidebar, SessionList, DetailPanel
│   └── hooks/          # useStore (composition), useSessions, useGTD, useFilters
└── shared/types/       # Shared TypeScript types (mirrored in Rust)

src-tauri/src/
├── lib.rs              # App entry — module registration & Tauri setup
├── models.rs           # Data structures (SessionInfo, GtdMetadata, AppStore)
├── helpers.rs          # Utility functions (path resolution, text extraction)
├── scanner.rs          # JSONL session file parsing
├── gtd.rs              # GTD state management (in-memory + disk persistence)
└── commands.rs         # Tauri IPC commands (with path validation)
```

**Frontend** — React 19, TypeScript, Tailwind v4, Radix UI, Lucide icons, react-markdown

**Backend** — Rust, Tauri v2, serde. The GTD store is held in memory via `tauri::State<Mutex<AppStore>>` and persisted to `$APPDATA/gtd-store.json` on every mutation.

**Communication** — Frontend calls Rust through `invoke()` IPC. Filesystem access is scoped to `$HOME/.claude/**` (reads) and `$APPDATA/**` (writes) via Tauri capabilities.

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `⌘K` | Focus search |
| `⌘B` | Toggle sidebar |
| `Esc` | Deselect session |
| `↑` `↓` | Navigate session list |

## License

MIT
