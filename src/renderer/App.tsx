import { useState, useEffect, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { SessionInfo, AppStore } from '../shared/types'
import { LoaderCircle, Search, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, FileText, FolderOpen } from 'lucide-react'
import { useStore } from './hooks/useStore'
import { Sidebar } from './components/Sidebar'
import { SessionList } from './components/SessionList'
import { DetailPanel } from './components/DetailPanel'
import { ToastContainer } from './components/Toast'

type Theme = 'light' | 'dark' | 'system'

export default function App() {
  const store = useStore()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const [isResizing, setIsResizing] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const selectedSessionIdRef = useRef(store.selectedSessionId)
  selectedSessionIdRef.current = store.selectedSessionId
  const filteredSessionsRef = useRef(store.filteredSessions)
  filteredSessionsRef.current = store.filteredSessions
  const projectBtnRef = useRef<HTMLButtonElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const settingsBtnRef = useRef<HTMLButtonElement>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')

  const handleSync = useCallback(async () => {
    setSyncing(true)
    setSettingsMenuOpen(false)
    try { await store.loadData() } finally { setSyncing(false) }
  }, [store.loadData])

  useEffect(() => {
    if (!projectMenuOpen && !settingsMenuOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (projectMenuOpen && projectBtnRef.current && !projectBtnRef.current.contains(target)
        && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setProjectMenuOpen(false)
      }
      if (settingsMenuOpen && settingsBtnRef.current && !settingsBtnRef.current.contains(target)) {
        setSettingsMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
        store.setSelectedSessionId(null)
        store.setShowTagInput(false)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarCollapsed(v => !v)
      }
      if (!selectedSessionIdRef.current && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && filteredSessionsRef.current.length > 0) {
        e.preventDefault()
        store.setSelectedSessionId(filteredSessionsRef.current[0].sessionId)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [store.setSelectedSessionId, store.setShowTagInput])

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
    <div className="flex flex-col h-screen overflow-hidden bg-surface">
      {/* Unified title bar */}
      <header className="h-[38px] flex items-center border-b border-edge/70 flex-shrink-0 relative" data-tauri-drag-region>
        <div className="w-[78px] flex-shrink-0" />
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-1.5 rounded-md hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
          title="Toggle sidebar (⌘B)"
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          ref={projectBtnRef}
          onClick={() => setProjectMenuOpen(v => !v)}
          className={`p-1.5 rounded-md transition-colors ${store.selectedProject ? 'text-blue-400 hover:bg-blue-500/10' : 'text-content-3 hover:bg-surface-3 hover:text-content-2'}`}
          title="Filter by project"
        >
          <FolderOpen className="w-4 h-4" />
        </button>
        {projectMenuOpen && createPortal(
          <div
            ref={projectMenuRef}
            className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[200px] max-h-[320px] overflow-y-auto"
            style={{ top: 38, left: 78 }}
          >
            <button
              onClick={() => { store.setSelectedProject(null); setProjectMenuOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${!store.selectedProject ? 'text-blue-400 bg-surface-3' : 'text-content-2 hover:bg-surface-3'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              All Projects
            </button>
            <div className="my-1 border-t border-edge/40" />
            {store.projects.map(p => (
              <button
                key={p.name}
                onClick={() => { store.setSelectedProject(store.selectedProject === p.name ? null : p.name); setProjectMenuOpen(false) }}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors ${store.selectedProject === p.name ? 'text-blue-400 bg-surface-3' : 'text-content-2 hover:bg-surface-3'}`}
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
                placeholder="Search... ⌘K"
                value={store.searchQuery}
                onChange={e => store.setSearchQuery(e.target.value)}
                aria-label="Search sessions"
                className="w-full bg-surface-2/80 border border-edge rounded-md pl-8 pr-3 py-1.5 text-xs text-content placeholder-content-4 focus:outline-none focus:border-content-3 transition-colors"
              />
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

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden relative">
        <Sidebar
          filterStatus={store.filterStatus}
          setFilterStatus={store.setFilterStatus}
          filterTag={store.filterTag}
          setFilterTag={store.setFilterTag}
          filterStarred={store.filterStarred}
          setFilterStarred={store.setFilterStarred}
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
        />

        <SessionList
          filteredSessions={store.filteredSessions}
          selectedSessionId={store.selectedSessionId}
          selectSession={store.selectSession}
          getGTD={store.getGTD}
          hasFilters={store.hasFilters}
        />

        {store.selectedSession ? (
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
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-content-4 text-sm flex flex-col items-center gap-3">
              <FileText className="w-10 h-10 text-content-5" />
              <span>Select a session to view details</span>
              <span className="text-[11px] text-content-5">Use ↑↓ keys to navigate, Esc to deselect</span>
            </div>
          </div>
        )}
      </div>
      <ToastContainer toasts={store.toasts} removeToast={store.removeToast} />
    </div>
  )
}
