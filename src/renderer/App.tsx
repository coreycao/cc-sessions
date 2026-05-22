import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { SessionInfo, AppStore } from '../shared/types'
import { LoaderCircle, Search, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, FileText, FolderOpen, X, Bookmark, ChevronDown } from 'lucide-react'
import { useStore } from './hooks/useStore'
import { Sidebar } from './components/Sidebar'
import { SessionList } from './components/SessionList'
import { DetailPanel } from './components/DetailPanel'
import { BatchActions } from './components/BatchActions'
import { SavedMessagesList } from './components/SavedMessagesList'
import { SavedMessageDetail } from './components/SavedMessageDetail'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'

type Theme = 'light' | 'dark' | 'system'

function projectDisplayName(projectPath: string | null): string {
  if (!projectPath) return 'All Projects'
  const segments = projectPath.split('/').filter(Boolean)
  return segments.at(-1) || projectPath
}

export default function App() {
  const store = useStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const [isResizing, setIsResizing] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [projectMenuPosition, setProjectMenuPosition] = useState({ top: 38, left: 105 })
  const searchRef = useRef<HTMLInputElement>(null)
  const projectBtnRef = useRef<HTMLButtonElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSettingsMenuOpen(false)
    try { await store.loadData() } finally { setSyncing(false) }
  }, [store.loadData])

  const toggleProjectMenu = useCallback(() => {
    const rect = projectBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setProjectMenuPosition({ top: rect.bottom + 5, left: rect.left })
    }
    setProjectMenuOpen(v => !v)
  }, [])

  useEffect(() => {
    if (!projectMenuOpen && !settingsMenuOpen) return
    const handler = (e: PointerEvent) => {
      const target = e.target as Node
      if (projectMenuOpen && projectBtnRef.current && !projectBtnRef.current.contains(target)
        && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setProjectMenuOpen(false)
      }
      if (settingsMenuOpen && settingsBtnRef.current && !settingsBtnRef.current.contains(target)) {
        setSettingsMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [projectMenuOpen, settingsMenuOpen])

  useEffect(() => {
    const root = document.documentElement
    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
      root.classList.toggle('dark', isDark)
    }
    apply()
    localStorage.setItem('theme', theme)
    if (theme === 'system') {
      const mq = matchMedia('(prefers-color-scheme: dark)')
      const handler = () => apply()
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    }
  }, [theme])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (store.batchSelectedIds.size > 0) {
          store.clearBatchSelection()
        } else {
          store.setSelectedSessionId(null)
          store.setShowTagInput(false)
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(v => !v)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
        if (document.activeElement === searchRef.current) return
        e.preventDefault()
        store.selectAllBatch(store.filteredSessions)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store.setSelectedSessionId, store.setShowTagInput, store.clearBatchSelection, store.selectAllBatch, store.batchSelectedIds.size, store.filteredSessions])

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      setSidebarWidth(Math.min(400, Math.max(180, startWidth + ev.clientX - startX)))
    }
    const onUp = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const currentProjectName = projectDisplayName(store.selectedProject)
  const currentProjectTitle = store.selectedProject || 'All Projects'

  const selectedSavedMessage = useMemo(
    () => store.savedMessages.find(m => m.id === store.selectedSavedId) || null,
    [store.savedMessages, store.selectedSavedId]
  )

  const jumpToSession = useCallback((sessionId: string) => {
    store.setView('sessions')
    store.setSelectedSavedId(null)
    const session = store.sessions.find(s => s.sessionId === sessionId)
    if (session) {
      store.selectSession(session)
    }
  }, [store.sessions, store.setView, store.setSelectedSavedId, store.selectSession])

  if (store.loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface">
        <div className="text-content-2 flex flex-col items-center gap-3">
          <LoaderCircle className="w-8 h-8 animate-spin" />
          <span className="text-sm">Scanning sessions...</span>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Unified title bar */}
      <header className="h-[38px] flex items-center border-b border-edge/50 flex-shrink-0 relative bg-surface-2/70" data-tauri-drag-region>
        <div className="w-[72px] flex-shrink-0" />
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-md hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
          title="Toggle sidebar (⌘B)"
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          ref={projectBtnRef}
          onClick={toggleProjectMenu}
          className={`ml-1 h-7 max-w-[240px] inline-flex items-center gap-1.5 rounded-md px-2 border transition-colors ${store.selectedProject ? 'text-accent bg-accent-subtle/60 border-accent/25 hover:bg-accent-subtle' : 'text-content-3 bg-surface-2 border-edge/60 hover:bg-surface-3 hover:text-content-2'}`}
          title={currentProjectTitle}
          aria-label={`Filter by project: ${currentProjectTitle}`}
        >
          <FolderOpen className="w-3.5 h-3.5" />
          <span className="max-w-[190px] truncate text-xs font-medium" title={currentProjectTitle}>{currentProjectName}</span>
          <ChevronDown className="w-3 h-3 opacity-40" />
        </button>
        {projectMenuOpen && createPortal(
          <div
            ref={projectMenuRef}
            className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[200px] max-h-[320px] overflow-y-auto"
            style={projectMenuPosition}
          >
            <button
              onClick={() => { store.setSelectedProject(null); setProjectMenuOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${!store.selectedProject ? 'text-accent bg-accent-subtle' : 'text-content-2 hover:bg-surface-3'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              All Projects
            </button>
            <div className="my-1 border-t border-edge/40" />
            {store.projects.map(p => (
              <button
                key={p.name}
                onClick={() => { store.setSelectedProject(store.selectedProject === p.name ? null : p.name); setProjectMenuOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${store.selectedProject === p.name ? 'text-accent bg-accent-subtle' : 'text-content-2 hover:bg-surface-3'}`}
              >
                <FolderOpen className="w-3.5 h-3.5" />
                <span className="truncate flex-1 text-left">{p.name}</span>
                <span className="text-content-4 tabular-nums">{p.sessionCount}</span>
              </button>
            ))}
          </div>,
          document.body
        )}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none" data-tauri-drag-region>
          <div className="w-64 pointer-events-auto">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-content-4" />
              <input
                ref={searchRef}
                type="text"
                placeholder="Search sessions... ⌘K"
                value={store.searchQuery}
                onChange={e => store.setSearchQuery(e.target.value)}
                aria-label="Search sessions"
                className="w-full bg-surface-2/80 border border-edge rounded-md pl-8 pr-8 py-1.5 text-xs text-content placeholder-content-4 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/20 transition-colors"
              />
              {store.isSearching ? (
                <LoaderCircle className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-content-4 animate-spin" />
              ) : store.searchQuery ? (
                <button
                  onClick={() => store.setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
                  aria-label="Clear search"
                >
                  <X className="w-3 h-3" />
                </button>
              ) : null}
              {!store.indexReady && store.searchQuery.length >= 2 && (
                <span className="absolute -bottom-4 left-0 text-[10px] text-content-4 animate-pulse whitespace-nowrap">Building search index...</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
          className="p-1.5 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors mr-2"
          title={`Theme: ${theme}`}
        >
          {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
        </button>
      </header>

      {/* Index building banner */}
      {!store.indexReady && (
        <div className="h-6 flex-shrink-0 flex items-center justify-center gap-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400">
          <LoaderCircle className="w-3 h-3 animate-spin" />
          <span>Building search index...</span>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          filterStatus={store.filterStatus}
          setFilterStatus={store.setFilterStatus}
          filterTag={store.filterTag}
          setFilterTag={store.setFilterTag}
          allTags={store.allTags}
          tagCounts={store.tagCounts}
          renameTag={store.renameTag}
          deleteTag={store.deleteTag}
          createTag={store.createTag}
          statusCounts={store.statusCounts}
          sidebarWidth={sidebarWidth}
          sidebarCollapsed={sidebarCollapsed}
          isResizing={isResizing}
          startResize={startResize}
          settingsMenuOpen={settingsMenuOpen}
          setSettingsMenuOpen={setSettingsMenuOpen}
          settingsBtnRef={settingsBtnRef}
          onSync={handleSync}
          syncing={syncing}
          sessions={store.sessions}
          view={store.view}
          setView={store.setView}
          savedCount={store.savedMessages.length}
        />

        <div className="flex flex-col w-[320px] flex-shrink-0 overflow-hidden">
          {store.view === 'sessions' ? (
            <>
              <BatchActions
                batchSelectedIds={store.batchSelectedIds}
                getGTD={store.getGTD}
                allTags={store.allTags}
                batchUpdateGTD={store.batchUpdateGTD}
                batchAddTag={store.batchAddTag}
                batchDeleteSessions={store.batchDeleteSessions}
                clearBatchSelection={store.clearBatchSelection}
                loadData={store.loadData}
                filterStatus={store.filterStatus}
                filteredCount={store.filteredSessions.length}
              />
              {store.selectedProject && (
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-edge/30 bg-accent-subtle/30">
                  <FolderOpen className="w-3 h-3 text-accent" />
                  <span className="text-[11px] text-content-2 truncate flex-1">{currentProjectName}</span>
                  <span className="text-[10px] text-content-4 tabular-nums">{store.filteredSessions.length}</span>
                  <button
                    onClick={() => store.setSelectedProject(null)}
                    className="p-0.5 rounded hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors"
                    aria-label="Clear project filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
              <SessionList
                filteredSessions={store.filteredSessions}
                selectedSessionId={store.selectedSessionId}
                selectSession={store.selectSession}
                getGTD={store.getGTD}
                hasFilters={store.hasFilters}
                contentResults={store.contentResults}
                batchSelectedIds={store.batchSelectedIds}
                toggleBatchSelect={store.toggleBatchSelect}
                batchSelectRange={store.batchSelectRange}
                lastClickedIndex={store.lastClickedIndex}
              />
            </>
          ) : (
            <>
              <div className="relative flex-shrink-0 h-[30px] flex items-center gap-2 px-3 border-b border-edge/30 bg-surface-2/60">
                <span className="text-[11px] text-content-3 font-medium absolute inset-x-0 flex items-center justify-center pointer-events-none">
                  Saved <span className="text-content-4 tabular-nums ml-0.5">({store.savedMessages.length})</span>
                </span>
              </div>
              <SavedMessagesList
                savedMessages={store.savedMessages}
                selectedSavedId={store.selectedSavedId}
                setSelectedSavedId={store.setSelectedSavedId}
              />
            </>
          )}
        </div>

        {store.view === 'sessions' ? (
          store.selectedSession ? (
            <DetailPanel
              selectedSession={store.selectedSession}
              sessionContent={store.sessionContent}
              getGTD={store.getGTD}
              updateSessionGTD={store.updateSessionGTD}
              addTag={store.addTag}
              removeTag={store.removeTag}
              allTags={store.allTags}
              deleteSession={store.deleteSession}
              restoreSession={store.restoreSession}
              setSelectedSessionId={store.setSelectedSessionId}
              showTagInput={store.showTagInput}
              setShowTagInput={store.setShowTagInput}
              newTag={store.newTag}
              setNewTag={store.setNewTag}
              isSaved={store.isSaved}
              addSavedMessage={store.addSavedMessage}
              removeSavedMessage={store.removeSavedMessage}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-content-4 text-sm flex flex-col items-center gap-3">
                <FileText className="w-10 h-10 text-content-5" />
                <span>Select a session to view details</span>
                <span className="text-[11px] text-content-5">Use ↑↓ keys to navigate, Esc to deselect</span>
              </div>
            </div>
          )
        ) : (
          selectedSavedMessage ? (
            <SavedMessageDetail
              message={selectedSavedMessage}
              sessions={store.sessions}
              removeSavedMessage={store.removeSavedMessage}
              setSelectedSavedId={store.setSelectedSavedId}
              onJumpToSession={jumpToSession}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-content-4 text-sm flex flex-col items-center gap-3">
                <Bookmark className="w-10 h-10 text-content-5" />
                <span>Select a saved message to view it</span>
              </div>
            </div>
          )
        )}
      </div>
      <ToastContainer toasts={store.toasts} removeToast={store.removeToast} />
    </div>
    </ErrorBoundary>
  )
}
