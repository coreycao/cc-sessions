import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { getVersion } from '@tauri-apps/api/app'
import { relaunch } from '@tauri-apps/plugin-process'
import { LoaderCircle, Search, Sun, Moon, Monitor, PanelLeftClose, PanelLeft, FileText, FolderOpen, X, Bookmark, ChevronDown, RefreshCw, ArrowDownCircle } from 'lucide-react'
import { useStore } from './hooks/useStore'
import { Sidebar } from './components/Sidebar'
import { SessionList } from './components/SessionList'
import { DetailPanel } from './components/DetailPanel'
import { BatchActions } from './components/BatchActions'
import { SavedMessagesList } from './components/SavedMessagesList'
import { SavedMessageDetail } from './components/SavedMessageDetail'
import { SettingsList, type SettingsSection } from './components/SettingsList'
import { SettingsPanel, type Theme, type UpdateState } from './components/SettingsPanel'
import { ToastContainer } from './components/Toast'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ProviderLogo } from './components/ProviderLogo'
import { useI18n } from './lib/i18n'
import {
  checkForUpdate, getInitialUpdaterMockMode, installUpdate, saveUpdaterMockMode,
  UPDATE_CHECK_TIMEOUT_MESSAGE, UPDATE_CHECK_TIMEOUT_MS,
  type AppUpdate, type UpdaterMockMode,
} from './lib/updater'

function projectDisplayName(projectPath: string | null, allProjectsLabel: string): string {
  if (!projectPath) return allProjectsLabel
  const segments = projectPath.split('/').filter(Boolean)
  return segments.at(-1) || projectPath
}

function projectSourceLabel(providers: Array<'claude' | 'codex'>, t: (key: string) => string): string {
  if (providers.length === 0) return ''
  if (providers.length > 1) return t('common.mixed')
  return providers[0] === 'codex' ? t('common.codex') : t('common.claude')
}

function projectSourceBadgeClass(label: string): string {
  if (label === 'Claude') return 'border-orange-300/45 bg-orange-50 text-[#d97757] dark:border-orange-400/20 dark:bg-orange-950/20'
  if (label === 'Codex') return 'border-zinc-300/70 bg-zinc-50 text-zinc-950 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50'
  return 'border-accent/20 bg-accent-subtle/70 text-accent'
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
}

function ProjectSourceBadge({ provider }: { provider: 'claude' | 'codex' }) {
  const label = provider === 'codex' ? 'Codex' : 'Claude'
  return (
    <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-medium leading-none ${projectSourceBadgeClass(label)}`}>
      {label}
    </span>
  )
}

export default function App() {
  const store = useStore()
  const { t } = useI18n()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(224)
  const [isResizing, setIsResizing] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('app')
  const [updateState, setUpdateState] = useState<UpdateState>('idle')
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updateProgress, setUpdateProgress] = useState<number | null>(null)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [appVersion, setAppVersion] = useState('dev')
  const [updaterMockMode, setUpdaterMockModeState] = useState<UpdaterMockMode | null>(() => getInitialUpdaterMockMode())
  const [projectMenuPosition, setProjectMenuPosition] = useState({ top: 38, left: 105 })
  const searchRef = useRef<HTMLInputElement>(null)
  const projectBtnRef = useRef<HTMLButtonElement>(null)
  const projectMenuRef = useRef<HTMLDivElement>(null)
  const updateRef = useRef<AppUpdate | null>(null)
  const updateReadyShouldRelaunchRef = useRef(false)
  const updateCheckSeq = useRef(0)
  const updateCheckTimeoutRef = useRef<number | null>(null)
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')

  const clearUpdateCheckTimeout = useCallback(() => {
    if (updateCheckTimeoutRef.current !== null) {
      window.clearTimeout(updateCheckTimeoutRef.current)
      updateCheckTimeoutRef.current = null
    }
  }, [])

  const setUpdaterMockMode = useCallback((mode: UpdaterMockMode) => {
    saveUpdaterMockMode(mode)
    setUpdaterMockModeState(mode)
    updateRef.current = null
    updateReadyShouldRelaunchRef.current = false
    setUpdateState('idle')
    setUpdateVersion(null)
    setUpdateProgress(null)
    setUpdateError(null)
  }, [])

  const handleCheckUpdate = useCallback(async (silent = false) => {
    const seq = ++updateCheckSeq.current
    clearUpdateCheckTimeout()
    setUpdateState('checking')
    setUpdateError(null)
    setUpdateProgress(null)
    updateReadyShouldRelaunchRef.current = false
    updateCheckTimeoutRef.current = window.setTimeout(() => {
      if (seq !== updateCheckSeq.current) return
      updateCheckSeq.current += 1
      updateCheckTimeoutRef.current = null
      updateRef.current = null
      updateReadyShouldRelaunchRef.current = false
      setUpdateState('error')
      setUpdateVersion(null)
      setUpdateProgress(null)
      setUpdateError(UPDATE_CHECK_TIMEOUT_MESSAGE)
      if (!silent) store.addToast(UPDATE_CHECK_TIMEOUT_MESSAGE)
    }, UPDATE_CHECK_TIMEOUT_MS + 500)

    try {
      const update = await checkForUpdate(updaterMockMode)
      if (seq !== updateCheckSeq.current) return
      clearUpdateCheckTimeout()
      updateRef.current = update
      updateReadyShouldRelaunchRef.current = false
      if (update) {
        setUpdateVersion(update.version)
        setUpdateState('available')
        if (!silent) store.addToast(t('app.updateAvailable', { version: update.version }), 'success')
      } else {
        setUpdateVersion(null)
        setUpdateState('current')
        if (!silent) store.addToast(t('app.upToDate'), 'success')
      }
    } catch (error) {
      if (seq !== updateCheckSeq.current) return
      clearUpdateCheckTimeout()
      const message = error instanceof Error ? error.message : t('app.failedUpdateCheck')
      setUpdateState('error')
      setUpdateVersion(null)
      setUpdateError(message)
      if (!silent) {
        store.addToast(message)
      }
    }
  }, [clearUpdateCheckTimeout, store.addToast, t, updaterMockMode])

  const handleInstallUpdate = useCallback(async () => {
    let update = updateRef.current
    if (!update) {
      setUpdateState('checking')
      setUpdateError(null)
      updateReadyShouldRelaunchRef.current = false
      update = await checkForUpdate(updaterMockMode)
      updateRef.current = update
    }
    if (!update) {
      setUpdateState('current')
      store.addToast(t('app.upToDate'), 'success')
      return
    }

    setUpdateState('downloading')
    setUpdateError(null)
    setUpdateProgress(null)
    let downloaded = 0
    let total: number | null = null

    try {
      const result = await installUpdate(update, event => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? null
          downloaded = 0
          setUpdateProgress(total ? 0 : null)
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength
          if (total) setUpdateProgress(Math.min(100, Math.round((downloaded / total) * 100)))
        } else if (event.event === 'Finished') {
          setUpdateProgress(100)
        }
      })
      setUpdateState('ready')
      updateReadyShouldRelaunchRef.current = result.shouldRelaunch
      store.addToast(t('app.updateReady', { version: update.version }), 'success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to install update'
      setUpdateState('error')
      setUpdateError(message)
      store.addToast(message)
    }
  }, [store.addToast, t, updaterMockMode])

  const handleRestartUpdate = useCallback(async () => {
    if (updateState !== 'ready') return

    if (updateReadyShouldRelaunchRef.current) {
      await relaunch()
      return
    }

    const version = updateRef.current?.version
    store.addToast(t('app.mockUpdateComplete', { version: version ?? 'update' }), 'success')
    setUpdateState('current')
    updateReadyShouldRelaunchRef.current = false
    updateRef.current = null
  }, [store.addToast, t, updateState])

  useEffect(() => {
    if (import.meta.env.PROD) {
      handleCheckUpdate(true)
    }
  }, [handleCheckUpdate])

  useEffect(() => clearUpdateCheckTimeout, [clearUpdateCheckTimeout])

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion('dev'))
  }, [])

  const toggleProjectMenu = useCallback(() => {
    const rect = projectBtnRef.current?.getBoundingClientRect()
    if (rect) {
      setProjectMenuPosition({ top: rect.bottom + 5, left: rect.left })
    }
    setProjectMenuOpen(v => !v)
  }, [])

  useEffect(() => {
    if (!projectMenuOpen) return
    const handler = (e: PointerEvent) => {
      const target = e.target as Node
      if (projectMenuOpen && projectBtnRef.current && !projectBtnRef.current.contains(target)
        && projectMenuRef.current && !projectMenuRef.current.contains(target)) {
        setProjectMenuOpen(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [projectMenuOpen])

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
        if (isEditableTarget(e.target) || isEditableTarget(document.activeElement)) return
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

  const currentProjectName = projectDisplayName(store.selectedProject, t('app.allProjects'))
  const currentProjectTitle = store.selectedProject || t('app.allProjects')
  const currentProject = store.projects.find(project => project.name === store.selectedProject) || null
  const currentProjectSource = currentProject ? projectSourceLabel(currentProject.providers, t) : null

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
          <span className="text-sm">{t('app.scanningSessions')}</span>
        </div>
      </div>
    )
  }

  return (
    <ErrorBoundary>
    <div className="flex flex-col h-screen overflow-hidden bg-surface-2">
      {/* Global refresh lock */}
      {store.refreshing && (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-surface/70 backdrop-blur-sm"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex min-w-[240px] flex-col items-center gap-3 rounded-xl border border-edge bg-surface px-6 py-5 shadow-2xl">
            <LoaderCircle className="h-6 w-6 animate-spin text-accent" />
            <div className="text-center">
              <div className="text-[13px] font-semibold text-content">{t('app.refreshingSessions')}</div>
              <div className="mt-1 text-[11px] text-content-4">{t('app.refreshingSessionsHint')}</div>
            </div>
            <div className="h-0.5 w-full overflow-hidden rounded-full bg-surface-3">
              <div className="h-full bg-accent animate-indeterminate-progress" />
            </div>
          </div>
        </div>
      )}
      {/* Unified title bar */}
      <header className="h-[44px] flex items-center border-b border-edge/50 flex-shrink-0 relative bg-surface-2/95" data-tauri-drag-region>
        <div className="w-[72px] flex-shrink-0" />
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="h-7 w-7 inline-flex items-center justify-center rounded-lg hover:bg-surface-3 text-content-3 hover:text-content-2 transition-colors"
          title={t('app.toggleSidebar')}
          aria-label={sidebarCollapsed ? t('app.showSidebar') : t('app.hideSidebar')}
          aria-expanded={!sidebarCollapsed}
        >
          {sidebarCollapsed ? <PanelLeft className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
        <button
          ref={projectBtnRef}
          onClick={toggleProjectMenu}
          className={`ml-1 h-7 max-w-[260px] inline-flex items-center gap-1.5 rounded-lg px-2 border shadow-sm transition-colors ${store.selectedProject ? 'text-accent bg-accent-subtle/70 border-accent/25 hover:bg-accent-subtle' : 'text-content-3 bg-surface border-edge/70 hover:bg-surface-3 hover:text-content-2'}`}
          title={currentProject ? `${currentProjectTitle} · ${currentProjectSource}` : currentProjectTitle}
          aria-label={t('app.filterByProject', { title: currentProjectTitle })}
        >
          {currentProjectSource && currentProject?.providers.length === 1
            ? (
              <ProviderLogo provider={currentProject.providers[0]} size="sm" />
            )
            : <FolderOpen className="w-3.5 h-3.5" />
          }
          <span className="max-w-[136px] truncate text-xs font-medium" title={currentProjectTitle}>{currentProjectName}</span>
          {currentProjectSource && (
            <span className={`inline-flex h-5 items-center rounded-full border px-1.5 text-[10px] font-medium leading-none ${projectSourceBadgeClass(currentProjectSource)}`}>
              {currentProjectSource}
            </span>
          )}
          <ChevronDown className="w-3 h-3 opacity-40" />
        </button>
        {projectMenuOpen && createPortal(
          <div
            ref={projectMenuRef}
            className="fixed z-[9999] bg-surface border border-edge rounded-xl shadow-xl py-1 min-w-[280px] max-w-[340px] max-h-[320px] overflow-y-auto"
            style={projectMenuPosition}
          >
            <button
              onClick={() => { store.setSelectedProject(null); setProjectMenuOpen(false) }}
              title={t('app.allProjects')}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${!store.selectedProject ? 'text-accent bg-accent-subtle' : 'text-content-2 hover:bg-surface-3'}`}
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span className="flex-1 truncate text-left">{t('app.allProjects')}</span>
              <span className="text-content-4 tabular-nums">{store.sessions.length}</span>
            </button>
            <div className="my-1 border-t border-edge/40" />
            {store.projects.map(p => (
              <button
                key={p.name}
                onClick={() => { store.setSelectedProject(store.selectedProject === p.name ? null : p.name); setProjectMenuOpen(false) }}
                title={p.path}
                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] transition-colors ${store.selectedProject === p.name ? 'text-accent bg-accent-subtle' : 'text-content-2 hover:bg-surface-3'}`}
              >
              <FolderOpen className="w-3.5 h-3.5" />
                <span className="truncate flex-1 text-left">{projectDisplayName(p.path, t('app.allProjects'))}</span>
                <div className="flex items-center gap-1">
                  {p.providers.length > 0 && (
                    p.providers.length === 1 ? (
                      <ProjectSourceBadge provider={p.providers[0]} />
                    ) : (
                      <>
                        <ProjectSourceBadge provider="claude" />
                        <ProjectSourceBadge provider="codex" />
                      </>
                    )
                  )}
                  <span className="ml-0.5 text-content-4 tabular-nums">{p.sessionCount}</span>
                </div>
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
                placeholder={t('app.searchPlaceholder')}
                value={store.searchQuery}
                onChange={e => store.setSearchQuery(e.target.value)}
                aria-label={t('app.searchLabel')}
                className="w-full bg-surface border border-edge/80 rounded-lg pl-8 pr-8 py-1.5 text-[12px] text-content placeholder-content-4 shadow-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-colors"
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
                <span className="absolute -bottom-4 left-0 text-[10px] text-content-4 animate-pulse whitespace-nowrap">{t('app.buildingIndex')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setTheme(theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light')}
          className="p-1.5 rounded-lg hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors mr-2"
          title={t('app.themeTitle', { theme })}
        >
          {theme === 'light' ? <Sun className="w-3.5 h-3.5" /> : theme === 'dark' ? <Moon className="w-3.5 h-3.5" /> : <Monitor className="w-3.5 h-3.5" />}
        </button>
      </header>

      {/* Index building banner */}
      {!store.indexReady && (
        <div className="h-6 flex-shrink-0 flex items-center justify-center gap-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[10px] text-amber-600 dark:text-amber-400">
          <LoaderCircle className="w-3 h-3 animate-spin" />
          <span>{t('app.buildingIndex')}</span>
        </div>
      )}

      {/* Session updates available banner */}
      {store.hasUpdates && (
        <div className="h-8 flex-shrink-0 flex items-center justify-center gap-2 bg-accent/8 border-b border-accent/15 animate-slide-down">
          <ArrowDownCircle className="w-3.5 h-3.5 text-accent" />
          <span className="text-[11px] text-accent font-medium">{t('app.updatesAvailable')}</span>
          <button
            onClick={store.refreshWithUpdates}
            className="inline-flex items-center gap-1 h-5 px-2 rounded-md bg-accent/15 hover:bg-accent/25 text-[10px] text-accent font-medium transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            {t('app.refresh')}
          </button>
          <button
            onClick={store.dismissUpdates}
            className="p-0.5 rounded hover:bg-accent/15 text-accent/50 hover:text-accent transition-colors"
            aria-label={t('app.dismissUpdates')}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Content area */}
      <div className="flex flex-1 overflow-hidden relative bg-surface-2 p-2 gap-2">
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
          sessions={store.sessions}
          view={store.view}
          setView={store.setView}
          savedCount={store.savedMessages.length}
        />

        <div className="flex flex-col w-[340px] flex-shrink-0 overflow-hidden rounded-xl border border-edge/70 bg-surface shadow-sm">
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
                providerFilter={store.providerFilter}
                setProviderFilter={store.setProviderFilter}
                providerCounts={store.providerCounts}
              />
              {store.selectedProject && (
                <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 border-b border-edge/50 bg-accent-subtle/40">
                  <FolderOpen className="w-3 h-3 text-accent" />
                  <span className="text-[11px] text-content-2 truncate flex-1">{currentProjectName}</span>
                  {currentProjectSource && (
                    <span className={`inline-flex h-4 items-center rounded-full border px-1.5 text-[9px] font-medium leading-none ${projectSourceBadgeClass(currentProjectSource)}`}>
                      {currentProjectSource}
                    </span>
                  )}
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
                filterStatus={store.filterStatus}
              />
            </>
          ) : store.view === 'saved' ? (
            <>
              <div className="relative flex-shrink-0 h-[42px] flex items-center gap-2 px-3 border-b border-edge/50 bg-surface">
                <span className="text-[13px] text-content font-semibold absolute inset-x-0 flex items-center justify-center pointer-events-none">
                  {t('app.savedTitle')} <span className="text-content-4 tabular-nums ml-0.5">({store.savedMessages.length})</span>
                </span>
              </div>
              <SavedMessagesList
                savedMessages={store.savedMessages}
                selectedSavedId={store.selectedSavedId}
                setSelectedSavedId={store.setSelectedSavedId}
              />
            </>
          ) : (
            <SettingsList selected={settingsSection} onSelect={setSettingsSection} />
          )}
        </div>

        {store.view === 'sessions' ? (
          store.selectedSession ? (
              <DetailPanel
                selectedSession={store.selectedSession}
                sessionContent={store.sessionContent}
                sessionContentLoading={store.sessionContentLoading}
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
              activeAiProfile={store.activeAiProfile}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-content-4 text-sm flex flex-col items-center gap-3">
                <FileText className="w-10 h-10 text-content-5" />
                <span>{t('app.selectSession')}</span>
                <span className="text-[11px] text-content-5">{t('app.navigationHint')}</span>
              </div>
            </div>
          )
        ) : store.view === 'saved' ? (
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
        ) : (
          <SettingsPanel
            section={settingsSection}
            theme={theme}
            setTheme={setTheme}
            appVersion={appVersion}
            updateState={updateState}
            updateVersion={updateVersion}
            updateProgress={updateProgress}
            updateError={updateError}
            updaterMockMode={updaterMockMode}
            setUpdaterMockMode={setUpdaterMockMode}
            onCheckUpdate={handleCheckUpdate}
            onInstallUpdate={handleInstallUpdate}
            onRestartUpdate={handleRestartUpdate}
            aiSettings={store.aiSettings}
            setAiSettings={store.setAiSettings}
            aiSettingsSaving={store.aiSettingsSaving}
            testingProfileId={store.testingProfileId}
            onSaveAiSettings={store.saveAiSettings}
            onTestAiProfile={store.testAiProfile}
          />
        )}
      </div>
      <ToastContainer toasts={store.toasts} removeToast={store.removeToast} />
    </div>
    </ErrorBoundary>
  )
}
