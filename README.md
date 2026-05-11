# CC Sessions

A desktop app for browsing and managing [Claude Code](https://docs.anthropic.com/en/docs/claude-code) session files. Built with Tauri v2 + React.

![macOS](https://img.shields.io/badge/platform-macOS-black)

## Features

- **Session browser** — Scans `~/.claude/projects/` and lists all your Claude Code sessions with metadata (title, project, git branch, message count, timestamps)
- **Conversation viewer** — Structured rendering of full conversations with Markdown support, syntax highlighting, collapsible tool calls (with status, duration, and result preview), thinking blocks, and system messages
- **Full-text search** — Two-tier search: instant local metadata filter + debounced content search across all conversation text (user messages, assistant responses, tool input/output) with relevance scoring and snippet previews
- **GTD workflow** — Organize sessions with status tracking (New / Archived), tags, notes, and starring
- **Inline notes** — Edit session notes directly in the detail panel without switching contexts
- **Session management** — Delete sessions or resume them directly in Terminal via `claude --resume`
- **Persistent cache** — Session metadata is cached to disk and incrementally updated, avoiding full JSONL re-parsing on every launch
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
├── renderer/              # React frontend
│   ├── App.tsx            # Root component — three-panel layout
│   ├── components/        # UI components
│   │   ├── Sidebar.tsx    # Filters (All/New/Starred/Archived), projects, tags
│   │   ├── SessionList.tsx
│   │   ├── DetailPanel.tsx
│   │   ├── ConversationMessage.tsx  # Structured conversation rendering
│   │   └── Toast.tsx
│   ├── hooks/             # State & logic hooks
│   │   ├── useStore.ts    # Root store (composition)
│   │   ├── useSessions.ts
│   │   ├── useGTD.ts
│   │   ├── useFilters.ts
│   │   ├── useContentSearch.ts  # Full-text content search
│   │   └── useToast.ts
│   └── lib/
│       ├── parseConversation.ts  # JSONL → structured conversation turns
│       └── utils.ts
└── shared/types/          # Shared TypeScript types (mirrored in Rust)

src-tauri/src/
├── lib.rs                 # App entry — module registration & Tauri setup
├── models.rs              # Data structures (SessionInfo, GtdMetadata, AppStore)
├── helpers.rs             # Utility functions (path resolution, text extraction)
├── scanner.rs             # JSONL session file parsing with disk cache
├── gtd.rs                 # GTD state management (in-memory + disk persistence)
└── commands.rs            # Tauri IPC commands (with path validation)
```

**Frontend** — React 19, TypeScript, Tailwind v4, Lucide icons, react-markdown + remark-gfm + rehype-highlight

**Backend** — Rust, Tauri v2, serde, tokio. The GTD store is held in memory via `tauri::State<Mutex<AppStore>>` and persisted to `$APPDATA/gtd-store.json` on every mutation. Session metadata is cached to `$APPDATA/session-cache.json` for fast startup.

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
