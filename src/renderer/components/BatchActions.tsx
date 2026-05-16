import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { GTDMetadata } from '../../shared/types'
import { Archive, Circle, Star, Tag, Trash2, X, AlertTriangle, Plus } from 'lucide-react'

type FilterView = 'all' | 'new' | 'archived' | 'starred'

interface BatchActionsProps {
  batchSelectedIds: Set<string>
  getGTD: (sessionId: string) => GTDMetadata
  allTags: string[]
  batchUpdateGTD: (ids: string[], updates: Partial<GTDMetadata>) => Promise<void>
  batchAddTag: (ids: string[], tag: string) => Promise<void>
  batchDeleteSessions: (ids: Set<string>, reloadAll: () => Promise<void>) => Promise<void>
  clearBatchSelection: () => void
  loadData: () => Promise<void>
  filterStatus: FilterView
  filteredCount: number
}

const FILTER_LABELS: Record<FilterView, string> = {
  all: 'All',
  new: 'New',
  starred: 'Starred',
  archived: 'Archived',
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
}: BatchActionsProps) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTagMenu, setShowTagMenu] = useState(false)
  const tagMenuRef = useRef<HTMLDivElement>(null)
  const tagBtnRef = useRef<HTMLButtonElement>(null)
  const [tagMenuPos, setTagMenuPos] = useState({ top: 0, left: 0 })

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
    await batchDeleteSessions(batchSelectedIds, loadData)
  }

  const openTagMenu = () => {
    if (tagBtnRef.current) {
      const r = tagBtnRef.current.getBoundingClientRect()
      setTagMenuPos({ top: r.bottom + 4, left: r.left })
    }
    setShowTagMenu(v => !v)
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

  return (
    <>
      <div className="relative flex-shrink-0 h-[30px] flex items-center gap-2 px-3 border-b border-edge/30 bg-surface-2/60">
        {count > 0 ? (
          <>
            <span className="text-[11px] text-accent font-medium tabular-nums">{count} selected</span>
            <div className="flex-1" />
            <button onClick={handleArchive} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={allArchived ? 'Unarchive' : 'Archive'}>
              {allArchived ? <Circle className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
            </button>
            <button onClick={handleStar} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title={allStarred ? 'Unstar' : 'Star'}>
              <Star className={`w-3.5 h-3.5 ${allStarred ? 'text-amber-400 fill-amber-400' : ''}`} />
            </button>
            <button ref={tagBtnRef} onClick={openTagMenu} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title="Add tag">
              <Tag className="w-3.5 h-3.5" />
            </button>
            <button onClick={handleDelete} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-red-400 transition-colors" title="Delete">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button onClick={clearBatchSelection} className="p-1 rounded-md hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors" title="Clear selection">
              <X className="w-3.5 h-3.5" />
            </button>
          </>
        ) : (
          <span className="text-[11px] text-content-3 font-medium absolute inset-x-0 flex items-center justify-center pointer-events-none">
            {FILTER_LABELS[filterStatus]} <span className="text-content-4 tabular-nums ml-0.5">({filteredCount})</span>
          </span>
        )}
      </div>

      {showTagMenu && createPortal(
        <div
          ref={tagMenuRef}
          className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[160px] max-h-[240px] overflow-y-auto"
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

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          count={count}
          onConfirm={confirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  )
}

function TagCreatorInput({ onSubmit }: { onSubmit: (tag: string) => void }) {
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
          placeholder="New tag..."
          className="flex-1 bg-surface-3/60 border border-edge rounded px-2 py-1 text-[11px] text-content placeholder-content-4 focus:outline-none focus:border-content-3"
        />
        <button type="submit" disabled={!value.trim()} className="p-1 rounded hover:bg-surface-3 text-content-4 hover:text-content-2 transition-colors disabled:opacity-30">
          <Plus className="w-3 h-3" />
        </button>
      </div>
    </form>
  )
}

function DeleteConfirmDialog({ count, onConfirm, onCancel }: {
  count: number
  onConfirm: () => void
  onCancel: () => void
}) {
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
            <h3 className="text-sm font-semibold text-content mb-1">Delete {count} Session{count !== 1 ? 's' : ''}</h3>
            <p className="text-xs text-content-3 leading-relaxed">
              Are you sure you want to delete <span className="text-content font-medium">{count} session{count !== 1 ? 's' : ''}</span>? This action cannot be undone.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-surface-3 text-content-2 hover:bg-surface transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500 text-white hover:bg-red-600 transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
