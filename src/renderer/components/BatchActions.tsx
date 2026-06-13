import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GTDMetadata, SessionProvider } from '../../shared/types'
import type { ProviderFilter } from '../hooks/useFilters'
import { Archive, Circle, Star, Tag, Trash2, X, AlertTriangle, Plus, Filter, RefreshCw } from 'lucide-react'
import { ProviderLogo } from './ProviderLogo'
import { useI18n } from '../lib/i18n'

type FilterView = 'all' | 'new' | 'archived' | 'starred'

interface BatchActionsProps {
  batchSelectedIds: Set<string>
  getGTD: (sessionId: string) => GTDMetadata
  allTags: string[]
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
}

export function BatchActions({
  batchSelectedIds,
  getGTD,
  allTags,
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
}: BatchActionsProps) {
  const { t } = useI18n()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const [showProviderMenu, setShowProviderMenu] = useState(false)
  const [showRefreshTooltip, setShowRefreshTooltip] = useState(false)
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

    </>
  )
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
