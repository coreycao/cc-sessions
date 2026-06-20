import { useState, useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { invoke } from '@tauri-apps/api/core'
import type { AiProfile, GTDMetadata, SessionInfo, SessionProvider } from '../../shared/types'
import type { ProviderFilter } from '../hooks/useFilters'
import { Archive, Circle, Star, Tag, Trash2, X, AlertTriangle, Plus, Filter, RefreshCw, Sparkles, LoaderCircle, CheckCircle2 } from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'
import { useI18n } from '../lib/i18n'
import { buildTitleContext, buildTitleFingerprint, isAiProfileConfigured } from '../lib/aiSessionContext'
import { Button, IconButton } from './ui'

type FilterView = 'all' | 'new' | 'archived' | 'starred'

interface BatchActionsProps {
  batchSelectedIds: Set<string>
  sessions: SessionInfo[]
  getGTD: (sessionId: string) => GTDMetadata
  allTags: string[]
  updateSessionGTD: (sessionId: string, updates: Partial<GTDMetadata>) => Promise<void>
  batchUpdateGTD: (ids: string[], updates: Partial<GTDMetadata>) => Promise<void>
  batchAddTag: (ids: string[], tag: string) => Promise<void>
  batchDeleteSessions: (ids: Set<string>) => Promise<void>
  clearBatchSelection: () => void
  loadData: () => Promise<void>
  filterStatus: FilterView
  filteredCount: number
  providerFilter: ProviderFilter
  setProviderFilter: (filter: ProviderFilter) => void
  providerCounts: Record<ProviderFilter, number>
  hasUpdates: boolean
  refreshWithUpdates: () => Promise<void>
  activeAiProfile: AiProfile | null
  onConfigureAi: () => void
}

export function BatchActions({
  batchSelectedIds,
  sessions,
  getGTD,
  allTags,
  updateSessionGTD,
  batchUpdateGTD,
  batchAddTag,
  batchDeleteSessions,
  clearBatchSelection,
  loadData,
  filterStatus,
  filteredCount,
  providerFilter,
  setProviderFilter,
  providerCounts,
  hasUpdates,
  refreshWithUpdates,
  activeAiProfile,
  onConfigureAi,
}: BatchActionsProps) {
  const { t } = useI18n()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [showRefreshTooltip, setShowRefreshTooltip] = useState(false)
  const [showAiRename, setShowAiRename] = useState(false)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  const tagBtnRef = useRef<HTMLButtonElement>(null)
  const providerMenuRef = useRef<HTMLDivElement>(null)
  const providerBtnRef = useRef<HTMLButtonElement>(null)
  const refreshBtnRef = useRef<HTMLButtonElement>(null)
  const [tagMenuPos, setTagMenuPos] = useState({ top: 0, left: 0 })
  const [providerMenuPos, setProviderMenuPos] = useState({ top: 0, left: 0 })
  const [refreshTooltipPos, setRefreshTooltipPos] = useState({ top: 0, left: 0 })

  const ids = Array.from(batchSelectedIds)
  const count = ids.length
  const selectedSessions = useMemo(() => {
    const selected = new Set(ids)
    return sessions.filter(session => selected.has(session.sessionId))
  }, [ids, sessions])

  const gtds = count > 0 ? ids.map(id => getGTD(id)) : []
  const allArchived = gtds.length > 0 && gtds.every(g => g.status === 'archived')
  const allStarred = gtds.length > 0 && gtds.every(g => g.starred)

  const handleArchive = () => {
    batchUpdateGTD(ids, { status: allArchived ? 'new' : 'archived' })
  }

  const handleStar = () => {
    batchUpdateGTD(ids, { starred: !allStarred })
  }

  const handleDelete = () => {
    setShowDeleteConfirm(true)
  }

  const openAiRename = () => {
    if (!isAiProfileConfigured(activeAiProfile)) {
      onConfigureAi()
      return
    }
    setShowAiRename(true)
  }

  const confirmDelete = async () => {
    setShowDeleteConfirm(false)
    await batchDeleteSessions(batchSelectedIds)
  }

  const openTagMenu = () => {
    if (tagBtnRef.current) {
      const r = tagBtnRef.current.getBoundingClientRect()
      setTagMenuPos({ top: r.bottom + 4, left: r.left })
    }
    setShowTagMenu(v => !v)
  }

  const openProviderMenu = () => {
    if (providerBtnRef.current) {
      const r = providerBtnRef.current.getBoundingClientRect()
      setProviderMenuPos({ top: r.bottom + 4, left: r.left })
    }
    setShowProviderMenu(v => !v)
  }

  const showRefreshHint = () => {
    if (refreshBtnRef.current) {
      const rect = refreshBtnRef.current.getBoundingClientRect()
      const left = Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180)
      setRefreshTooltipPos({ top: rect.bottom + 8, left })
    }
    setShowRefreshTooltip(true)
  }

  const chooseProvider = (filter: ProviderFilter) => {
    setProviderFilter(filter)
    setShowProviderMenu(false)
  }

  const handleAddTag = async (tag: string) => {
    setShowTagMenu(false)
    await batchAddTag(ids, tag)
  }

  useEffect(() => {
    if (!showTagMenu) return
    const handler = (e: PointerEvent) => {
      if (tagMenuRef.current && !tagMenuRef.current.contains(e.target as Node)
        && tagBtnRef.current && !tagBtnRef.current.contains(e.target as Node)) {
        setShowTagMenu(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [showTagMenu])

  useEffect(() => {
    if (!showProviderMenu) return
    const handler = (e: PointerEvent) => {
      if (providerMenuRef.current && !providerMenuRef.current.contains(e.target as Node)
        && providerBtnRef.current && !providerBtnRef.current.contains(e.target as Node)) {
        setShowProviderMenu(false)
      }
    }
    document.addEventListener('pointerdown', handler, true)
    return () => document.removeEventListener('pointerdown', handler, true)
  }, [showProviderMenu])

  const providerLabel = providerFilter === 'all'
    ? t('batch.allSources')
    : providerFilter === 'codex' ? t('common.codex') : t('common.claude')

  const filterLabels: Record<FilterView, string> = {
    all: t('sidebar.all'),
    new: t('sidebar.new'),
    starred: t('sidebar.starred'),
    archived: t('sidebar.archived'),
  }

  return (
    <>
      <div className="relative flex-shrink-0 h-[34px] flex items-center gap-2 px-4 border-b border-edge/50 bg-surface">
        {count > 0 ? (
          <>
            <span className="text-[12px] text-accent font-medium tabular-nums">{t('batch.selected', { count })}</span>
            <div className="flex-1" />
            <button onClick={handleArchive} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={allArchived ? t('batch.unarchive') : t('batch.archive')}>
              {allArchived ? <Circle className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleStar} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={allStarred ? t('batch.unstar') : t('batch.star')}>
              <Star className={`w-3.5 h-3.5 ${allStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
            </button>
            <button ref={tagBtnRef} onClick={openTagMenu} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={t('batch.addTag')}>
              <Tag className="w-3.5 h-3.5" />
            </button>
            <button onClick={openAiRename} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-accent transition-colors" title={t('batch.aiRename')}>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-red-400 transition-colors" title={t('common.delete')}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={clearBatchSelection} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={t('batch.clearSelection')}>
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <>
            <span className="text-[13px] text-content font-semibold absolute inset-x-0 flex items-center justify-center pointer-events-none">
              {filterLabels[filterStatus]} <span className="text-content-4 tabular-nums ml-0.5">({filteredCount})</span>
            </span>
            <div className="flex-1" />
            {hasUpdates && (
              <button
                ref={refreshBtnRef}
                onClick={refreshWithUpdates}
                onMouseEnter={showRefreshHint}
                onMouseLeave={() => setShowRefreshTooltip(false)}
                onFocus={showRefreshHint}
                onBlur={() => setShowRefreshTooltip(false)}
                className="relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-accent/25 bg-accent-subtle/70 text-accent shadow-sm transition-colors hover:bg-accent-subtle"
                aria-label={t('batch.sessionUpdatesAvailable')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              ref={providerBtnRef}
              onClick={openProviderMenu}
              className={`relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${providerFilter === 'all' ? 'border-edge/70 bg-surface text-content-4 hover:bg-surface-3 hover:text-content-2' : 'border-accent/25 bg-accent-subtle/70 text-accent hover:bg-accent-subtle'}`}
              title={t('batch.filterSource', { label: providerLabel })}
              aria-label={t('batch.filterSource', { label: providerLabel })}
              aria-expanded={showProviderMenu}
            >
              <Filter className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>

      {showRefreshTooltip && createPortal(
        <div
          className="pointer-events-none fixed z-[9999] max-w-[420px] -translate-x-1/2 rounded-lg border border-edge bg-surface px-2.5 py-1.5 text-[11px] font-medium text-content-2 shadow-lg"
          style={{ top: refreshTooltipPos.top, left: refreshTooltipPos.left }}
        >
          {t('batch.sessionUpdatesAvailable')}
        </div>,
        document.body,
      )}

      {showTagMenu && createPortal(
        <div
          ref={tagMenuRef}
          className="fixed z-[9999] bg-surface border border-edge rounded-xl shadow-xl py-1 min-w-[160px] max-h-[240px] overflow-y-auto"
          style={{ top: tagMenuPos.top, left: tagMenuPos.left }}
        >
          {allTags.length > 0 && allTags.map(tag => (
            <button
              key={tag}
              onClick={() => handleAddTag(tag)}
              className="w-full text-left px-3 py-1.5 text-[11px] text-content-2 hover:bg-surface-3 hover:text-content transition-colors"
            >
              {tag}
            </button>
          ))}
          <TagCreatorInput onSubmit={handleAddTag} />
        </div>,
        document.body,
      )}

      {showProviderMenu && createPortal(
        <div
          ref={providerMenuRef}
          className="fixed z-[9999] min-w-[178px] overflow-hidden rounded-xl border border-edge bg-surface py-1 shadow-xl"
          style={{ top: providerMenuPos.top, left: providerMenuPos.left }}
        >
          <ProviderFilterItem
            label={t('batch.allSources')}
            count={providerCounts.all}
            active={providerFilter === 'all'}
            onClick={() => chooseProvider('all')}
          />
          <ProviderFilterItem
            provider="claude"
            label={t('batch.claudeCode')}
            count={providerCounts.claude}
            active={providerFilter === 'claude'}
            onClick={() => chooseProvider('claude')}
          />
          <ProviderFilterItem
            provider="codex"
            label={t('batch.codexCli')}
            count={providerCounts.codex}
            active={providerFilter === 'codex'}
            onClick={() => chooseProvider('codex')}
          />
        </div>,
        document.body,
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          title={t('batch.deleteTitle', { count })}
          message={<>{t('batch.deleteMessage', { count })}</>}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {showAiRename && isAiProfileConfigured(activeAiProfile) && (
        <BatchAiRenameDialog
          sessions={selectedSessions}
          getGTD={getGTD}
          activeAiProfile={activeAiProfile}
          updateSessionGTD={updateSessionGTD}
          onClose={() => setShowAiRename(false)}
        />
      )}

    </>
  )
}

type AiRenameStatus = 'pending' | 'generating' | 'ready' | 'skipped' | 'error' | 'applied'
type AiRenameFilter = 'active' | 'all' | AiRenameStatus

interface AiRenameItem {
  session: SessionInfo
  currentTitle: string
  suggestedTitle: string
  status: AiRenameStatus
  selected: boolean
  content?: string
  error?: string
}

const AI_RENAME_LIMIT = 20

function BatchAiRenameDialog({
  sessions,
  getGTD,
  activeAiProfile,
  updateSessionGTD,
  onClose,
}: {
  sessions: SessionInfo[]
  getGTD: (sessionId: string) => GTDMetadata
  activeAiProfile: AiProfile
  updateSessionGTD: (sessionId: string, updates: Partial<GTDMetadata>) => Promise<void>
  onClose: () => void
}) {
  const { t } = useI18n()
  const [initialSessions] = useState(() => sessions)
  const [items, setItems] = useState<AiRenameItem[]>(() => createAiRenameItems(sessions, getGTD))
  const [filter, setFilter] = useState<AiRenameFilter>('active')
  const [filterOpen, setFilterOpen] = useState(false)
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const filterRef = useRef<HTMLDivElement>(null)
  const selectedCount = items.filter(item => item.selected && item.status === 'ready').length
  const readyCount = items.filter(item => item.status === 'ready').length
  const limited = initialSessions.length > AI_RENAME_LIMIT
  const visibleItems = useMemo(() => filterAiRenameItems(items, filter), [filter, items])
  const filterOptions = useMemo(() => getAiRenameFilterOptions(t, items), [items, t])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (!running && !applying) onClose()
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [applying, onClose, running])

  useEffect(() => {
    if (!filterOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setFilterOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [filterOpen])

  const updateItem = (sessionId: string, updates: Partial<AiRenameItem>) => {
    setItems(current => current.map(item => item.session.sessionId === sessionId ? { ...item, ...updates } : item))
  }

  const generateSuggestions = async () => {
    if (running) return
    setRunning(true)
    const targets = items.filter(item => item.status === 'pending').slice(0, AI_RENAME_LIMIT)

    for (const item of targets) {
      updateItem(item.session.sessionId, { status: 'generating', error: undefined })
      try {
        const content = await invoke<string>('read_session_content', { filePath: item.session.fullPath })
        const title = await invoke<string>('generate_session_title', {
          profileId: activeAiProfile.id,
          currentTitle: item.currentTitle,
          transcript: buildTitleContext(item.session, content),
        })
        updateItem(item.session.sessionId, {
          status: 'ready',
          suggestedTitle: title,
          selected: true,
          content,
        })
      } catch (error) {
        updateItem(item.session.sessionId, {
          status: 'error',
          selected: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    setRunning(false)
  }

  const applySelected = async () => {
    if (applying || selectedCount === 0) return
    setApplying(true)
    const targets = items.filter(item => item.selected && item.status === 'ready')
    for (const item of targets) {
      try {
        await updateSessionGTD(item.session.sessionId, {
          displayTitle: item.suggestedTitle,
          titleSource: 'ai',
          titleUpdatedAt: new Date().toISOString(),
          titleFingerprint: buildTitleFingerprint(item.session, item.content ?? ''),
        })
        updateItem(item.session.sessionId, { status: 'applied', selected: false })
      } catch (error) {
        updateItem(item.session.sessionId, {
          status: 'error',
          selected: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }
    setApplying(false)
  }

  const toggleItem = (sessionId: string) => {
    setItems(current => current.map(item => (
      item.session.sessionId === sessionId && item.status === 'ready'
        ? { ...item, selected: !item.selected }
        : item
    )))
  }

  return createPortal(
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={() => { if (!running && !applying) onClose() }}>
      <div className="flex max-h-[82vh] w-[min(820px,calc(100vw-48px))] flex-col overflow-hidden rounded-xl border border-edge bg-surface shadow-2xl" onClick={event => event.stopPropagation()}>
        <div className="flex h-12 items-center gap-3 border-b border-edge/70 px-4">
          <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent-subtle text-accent">
            {running ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-semibold text-content">{t('batch.aiRenameTitle')}</div>
            <div className="truncate text-[11px] text-content-4">{t('batch.aiRenameSubtitle', { count: initialSessions.length })}</div>
          </div>
          <div className="hidden max-w-[280px] truncate text-[11px] text-content-4 md:block">
            {limited ? t('batch.aiRenameLimit', { limit: AI_RENAME_LIMIT }) : t('batch.aiRenameReadyCount', { count: readyCount })}
          </div>
          <div ref={filterRef} className="relative">
            <Button
              size="sm"
              variant={filter === 'active' ? 'secondary' : 'accent'}
              icon={<Filter className="h-3.5 w-3.5" />}
              onClick={() => setFilterOpen(open => !open)}
              aria-haspopup="menu"
              aria-expanded={filterOpen}
            >
              {getAiRenameFilterLabel(t, filter)}
            </Button>
            {filterOpen && (
              <div className="absolute right-0 top-[calc(100%+6px)] z-10 w-44 overflow-hidden rounded-xl border border-edge bg-surface py-1 shadow-xl">
                {filterOptions.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setFilter(option.value)
                      setFilterOpen(false)
                    }}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[12px] transition-colors ${filter === option.value ? 'bg-accent-subtle text-accent' : 'text-content-3 hover:bg-surface-2 hover:text-content'}`}
                    role="menuitemradio"
                    aria-checked={filter === option.value}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${filter === option.value ? 'bg-accent' : 'bg-content-4/50'}`} />
                      {option.label}
                    </span>
                    <span className="text-[11px] text-content-4">{option.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <IconButton
            label={t('session.closeEsc')}
            icon={<X className="h-4 w-4" />}
            disabled={running || applying}
            onClick={onClose}
          />
        </div>

        <div className="min-h-[260px] flex-1 overflow-y-auto px-4 py-3">
          {visibleItems.length > 0 ? (
            <div className="space-y-2">
              {visibleItems.map(item => (
              <button
                key={item.session.sessionId}
                type="button"
                onClick={() => toggleItem(item.session.sessionId)}
                disabled={item.status !== 'ready' || running || applying}
                className={`grid w-full grid-cols-[24px_minmax(0,1fr)_minmax(0,1fr)_88px] items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors ${item.selected ? 'border-accent/35 bg-accent-subtle/70' : 'border-edge bg-surface hover:bg-surface-2'} disabled:cursor-default disabled:opacity-80`}
              >
                <span className={`inline-flex h-4 w-4 items-center justify-center rounded-md border ${item.selected ? 'border-accent bg-accent text-white' : 'border-edge bg-surface-2 text-transparent'}`}>
                  {item.selected && <CheckCircle2 className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12px] font-medium text-content">{item.currentTitle}</span>
                  <span className="block truncate text-[10px] text-content-4">{item.session.projectName || item.session.projectPath}</span>
                </span>
                <span className="min-w-0">
                  <span className={`block truncate text-[12px] font-medium ${getAiRenameInlineStatusClass(item)}`}>
                    {item.suggestedTitle || item.error || getAiRenameStatusLabel(t, item.status)}
                  </span>
                </span>
                <span className={`justify-self-end rounded-full border px-2 py-0.5 text-[10px] font-medium ${getAiRenameStatusClass(item.status)}`}>
                  {getAiRenameStatusLabel(t, item.status)}
                </span>
              </button>
              ))}
            </div>
          ) : (
            <div className="flex h-52 items-center justify-center rounded-xl border border-dashed border-edge bg-surface-2/35 text-[12px] text-content-4">
              {t('batch.noSessionsForFilter')}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-edge/70 px-4 py-3">
          <div className="text-[11px] text-content-4">{t('batch.aiRenameLocalOnly')}</div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose} variant="ghost" disabled={running || applying}>{t('common.cancel')}</Button>
            <Button onClick={generateSuggestions} loading={running} disabled={applying || items.every(item => item.status !== 'pending')} icon={<Sparkles className="h-3.5 w-3.5" />}>
              {t('batch.generateTitles')}
            </Button>
            <Button onClick={applySelected} variant="primary" loading={applying} disabled={running || selectedCount === 0}>
              {t('batch.applySelected', { count: selectedCount })}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function createAiRenameItems(
  sessions: SessionInfo[],
  getGTD: (sessionId: string) => GTDMetadata,
): AiRenameItem[] {
  return sessions.map(session => {
    const gtd = getGTD(session.sessionId)
    const customTitle = gtd.displayTitle?.trim()
    const skipped = Boolean(customTitle)
    return {
      session,
      currentTitle: customTitle || session.title,
      suggestedTitle: '',
      status: skipped ? 'skipped' : 'pending',
      selected: false,
    }
  })
}

function filterAiRenameItems(items: AiRenameItem[], filter: AiRenameFilter): AiRenameItem[] {
  if (filter === 'all') return items
  if (filter === 'active') return items.filter(item => item.status !== 'skipped')
  return items.filter(item => item.status === filter)
}

function getAiRenameFilterOptions(
  t: (key: string, params?: Record<string, string | number>) => string,
  items: AiRenameItem[],
): Array<{ value: AiRenameFilter; label: string; count: number }> {
  const countStatus = (status: AiRenameStatus) => items.filter(item => item.status === status).length
  return [
    { value: 'active', label: t('batch.filterActive'), count: items.filter(item => item.status !== 'skipped').length },
    { value: 'all', label: t('batch.filterAll'), count: items.length },
    { value: 'pending', label: t('batch.pending'), count: countStatus('pending') },
    { value: 'ready', label: t('batch.ready'), count: countStatus('ready') },
    { value: 'skipped', label: t('batch.skipped'), count: countStatus('skipped') },
    { value: 'error', label: t('batch.failed'), count: countStatus('error') },
    { value: 'applied', label: t('batch.applied'), count: countStatus('applied') },
  ]
}

function getAiRenameFilterLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  filter: AiRenameFilter,
): string {
  if (filter === 'active') return t('batch.filterActive')
  if (filter === 'all') return t('batch.filterAll')
  return getAiRenameStatusLabel(t, filter)
}

function getAiRenameStatusLabel(t: (key: string, params?: Record<string, string | number>) => string, status: AiRenameStatus): string {
  if (status === 'generating') return t('batch.generating')
  if (status === 'ready') return t('batch.ready')
  if (status === 'skipped') return t('batch.skipped')
  if (status === 'error') return t('batch.failed')
  if (status === 'applied') return t('batch.applied')
  return t('batch.pending')
}

function getAiRenameInlineStatusClass(item: AiRenameItem): string {
  if (item.suggestedTitle) return 'text-content'
  if (item.status === 'generating') return 'text-blue-500 dark:text-blue-400'
  if (item.status === 'error') return 'text-red-400'
  if (item.status === 'applied') return 'text-emerald-500'
  return 'text-content-4'
}

function getAiRenameStatusClass(status: AiRenameStatus): string {
  if (status === 'generating') return 'border-blue-500/25 bg-blue-500/10 text-blue-500 dark:text-blue-400'
  if (status === 'ready') return 'border-accent/25 bg-accent-subtle text-accent'
  if (status === 'error') return 'border-red-500/25 bg-red-500/10 text-red-400'
  if (status === 'applied') return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-500'
  if (status === 'skipped') return 'border-edge bg-surface-2 text-content-4'
  return 'border-edge bg-surface-2 text-content-4'
}

function ProviderFilterItem({
  provider,
  label,
  count,
  active,
  onClick,
}: {
  provider?: SessionProvider
  label: string
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[11px] transition-colors ${active ? 'bg-accent-subtle text-accent' : 'text-content-2 hover:bg-surface-3 hover:text-content'}`}
    >
      {provider ? (
        <ProviderLogo provider={provider} />
      ) : (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-md border border-edge bg-surface-2 text-content-4">
          <Filter className="h-2.5 w-2.5" />
        </span>
      )}
      <span className="flex-1">{label}</span>
      <span className="text-content-4 tabular-nums">{count.toLocaleString()}</span>
    </button>
  )
}

function TagCreatorInput({ onSubmit }: { onSubmit: (tag: string) => void }) {
  const { t } = useI18n()
  const [value, setValue] = useState('')
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { ref.current?.focus() }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = value.trim().toLowerCase()
    if (trimmed) onSubmit(trimmed)
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-edge/40 mt-1 pt-1 px-2">
      <div className="flex items-center gap-1">
        <input
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder={t('batch.newTagPlaceholder')}
          className="flex-1 bg-surface-3/60 border border-edge rounded px-2 py-1 text-[11px] text-content placeholder-content-4 focus:outline-none focus:border-content-3"
        />
        <button type="submit" disabled={!value.trim()} className="p-1 rounded hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors disabled:opacity-30">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </form>
  )
}

function DeleteConfirmDialog({ title, message, onConfirm, onCancel }: {
  title: string
  message: React.ReactNode
  onConfirm: () => void
  onCancel: () => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onCancel])

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 backdrop-blur-sm modal-animate-in" onClick={onCancel}>
      <div className="bg-surface-2 border border-edge rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-full bg-red-500/10 shrink-0">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-content mb-1">{title}</h3>
            <p className="text-xs text-content-3 leading-relaxed">
              {message}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-content-2 hover:bg-surface transition-colors"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
