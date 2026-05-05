import { useState, useCallback, useRef, useEffect, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { GTD_STATUS_CONFIG, GTD_STATUS_LIST } from '../lib/utils'
import {
  Inbox, CircleDot, LoaderCircle, Clock, CircleCheck, Archive,
  Star, Tag, LayoutList, Pencil, Trash, Plus, Settings, RefreshCw,
} from 'lucide-react'
import type { GTDStatus } from '../../shared/types'

const STATUS_ICONS: Record<string, any> = { Inbox, CircleDot, LoaderCircle, Clock, CircleCheck, Archive }

interface SidebarProps {
  filterStatus: GTDStatus | 'all'
  setFilterStatus: (s: GTDStatus | 'all') => void
  filterTag: string | null
  setFilterTag: (t: string | null) => void
  filterStarred: boolean
  setFilterStarred: (v: boolean) => void
  allTags: string[]
  tagCounts: Record<string, number>
  renameTag: (oldTag: string, newTag: string) => Promise<void>
  deleteTag: (tag: string) => Promise<void>
  createTag: (tag: string) => Promise<void>
  statusCounts: Record<string, number>
  sidebarWidth: number
  sidebarCollapsed: boolean
  isResizing: boolean
  startResize: (e: React.MouseEvent) => void
  settingsMenuOpen: boolean
  setSettingsMenuOpen: (v: boolean) => void
  settingsBtnRef: RefObject<HTMLButtonElement | null>
  onSync: () => Promise<void>
  syncing: boolean
}

export function Sidebar({
  filterStatus, setFilterStatus,
  filterTag, setFilterTag,
  filterStarred, setFilterStarred,
  allTags, tagCounts, renameTag, deleteTag, createTag,
  statusCounts,
  sidebarWidth, sidebarCollapsed, isResizing, startResize,
  settingsMenuOpen, setSettingsMenuOpen, settingsBtnRef, onSync, syncing,
}: SidebarProps) {
  const [ctxMenu, setCtxMenu] = useState<{ tag: string; x: number; y: number } | null>(null)
  const [editingTag, setEditingTag] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleTagContextMenu = useCallback((e: React.MouseEvent, tag: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ tag, x: e.clientX, y: e.clientY })
  }, [])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('contextmenu', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('contextmenu', close)
      window.removeEventListener('keydown', close)
    }
  }, [ctxMenu])

  const startEditTag = useCallback((tag: string) => {
    setCtxMenu(null)
    setEditingTag(tag)
    setEditValue(tag)
  }, [])

  const submitEditTag = useCallback(async () => {
    if (editingTag && editValue.trim()) {
      await renameTag(editingTag, editValue)
    }
    setEditingTag(null)
    setEditValue('')
  }, [editingTag, editValue, renameTag])

  const [showNewTag, setShowNewTag] = useState(false)
  const [newTagValue, setNewTagValue] = useState('')

  const submitNewTag = useCallback(async () => {
    if (newTagValue.trim()) {
      await createTag(newTagValue)
    }
    setShowNewTag(false)
    setNewTagValue('')
  }, [newTagValue, createTag])

  return (
    <div
      className={`relative flex-shrink-0 flex flex-col bg-surface overflow-hidden ${sidebarCollapsed ? 'w-0 border-r-0' : 'border-r border-edge/70'} ${isResizing ? '' : 'transition-[width,border-color] duration-200 ease-in-out'}`}
      style={!sidebarCollapsed ? { width: sidebarWidth } : undefined}
    >
      <div className="flex flex-col h-full overflow-y-auto overflow-x-hidden" style={{ width: sidebarWidth }}>
        {/* Status filters */}
        <div className="px-2 py-1.5 border-b border-edge/50">
          <div className="space-y-0.5">
            <FilterButton
              active={filterStatus === 'all' && !filterTag && !filterStarred}
              onClick={() => { setFilterStatus('all'); setFilterTag(null); setFilterStarred(false) }}
              icon={<LayoutList className="w-3.5 h-3.5" />}
              label="All"
              count={statusCounts.all || 0}
            />
            {GTD_STATUS_LIST.map(status => {
              const config = GTD_STATUS_CONFIG[status]
              const Icon = STATUS_ICONS[config.icon]
              return (
                <div key={status} className="flex items-stretch">
                  <span className="w-4 flex-shrink-0 flex justify-center">
                    <span className="w-px bg-edge/60" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <FilterButton
                      active={filterStatus === status && !filterTag && !filterStarred}
                      onClick={() => { setFilterStatus(filterStatus === status ? 'all' : status); setFilterTag(null); setFilterStarred(false) }}
                      icon={<Icon className="w-3.5 h-3.5" />}
                      label={config.label}
                      count={statusCounts[status] || 0}
                    />
                  </div>
                </div>
              )
            })}
            <div className="my-1 mx-2 border-t border-edge/40" />
            <FilterButton
              active={filterStarred && filterStatus === 'all' && !filterTag}
              onClick={() => { setFilterStarred(!filterStarred); setFilterStatus('all'); setFilterTag(null) }}
              icon={<Star className="w-3.5 h-3.5" />}
              label="Starred"
              count={statusCounts.starred || 0}
            />
          </div>
        </div>

        {/* Tags */}
        <div className="px-2 py-1.5 border-b border-edge/50">
          <div className="flex items-center justify-between mb-1 px-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-content-4">Tags</span>
            <button
              onClick={() => setShowNewTag(true)}
              className="text-content-4 hover:text-content-2 transition-colors"
              title="New tag"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>
          {showNewTag && (
            <form onSubmit={e => { e.preventDefault(); submitNewTag() }} className="px-2 mb-1">
              <input
                type="text"
                value={newTagValue}
                onChange={e => setNewTagValue(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setShowNewTag(false); setNewTagValue('') } }}
                placeholder="new tag..."
                className="w-full bg-surface-2 border border-edge rounded-md px-2 py-1 text-xs text-content placeholder-content-4 focus:outline-none focus:border-content-3"
                autoFocus
              />
            </form>
          )}
          {allTags.length > 0 && (
            <div className="space-y-0.5">
              {allTags.map(tag => (
                editingTag === tag ? (
                  <form key={tag} onSubmit={e => { e.preventDefault(); submitEditTag() }} className="px-2">
                    <input
                      type="text"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Escape') { setEditingTag(null); setEditValue('') } }}
                      className="w-full bg-surface-2 border border-edge rounded-md px-2 py-1 text-xs text-content placeholder-content-4 focus:outline-none focus:border-content-3"
                      autoFocus
                    />
                  </form>
                ) : (
                  <FilterButton
                    key={tag}
                    active={filterTag === tag}
                    onClick={() => { setFilterTag(filterTag === tag ? null : tag); setFilterStatus('all'); setFilterStarred(false) }}
                    onContextMenu={e => handleTagContextMenu(e, tag)}
                    icon={<Tag className="w-3 h-3" />}
                    label={tag}
                    count={tagCounts[tag] || 0}
                  />
                )
              ))}
            </div>
          )}
        </div>
        {ctxMenu && createPortal(
          <div
            className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[120px]"
            style={{ top: ctxMenu.y, left: ctxMenu.x }}
            onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => startEditTag(ctxMenu.tag)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-content-2 hover:bg-surface-3 transition-colors"
            >
              <Pencil className="w-3 h-3" />Edit tag
            </button>
            <button
              onClick={() => { deleteTag(ctxMenu.tag); setCtxMenu(null) }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-red-400 hover:bg-surface-3 transition-colors"
            >
              <Trash className="w-3 h-3" />Delete tag
            </button>
          </div>,
          document.body
        )}

        <div className="flex-1" />
        <div className="px-2 py-1.5 border-t border-edge/50">
          <button
            ref={settingsBtnRef}
            onClick={() => setSettingsMenuOpen(v => !v)}
            className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs text-content-3 hover:bg-surface-2 hover:text-content-2 transition-colors"
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Settings</span>
          </button>
          {settingsMenuOpen && createPortal(
            <div
              className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[160px]"
              style={{ bottom: window.innerHeight - (settingsBtnRef.current?.getBoundingClientRect().top || 0) + 4, left: settingsBtnRef.current?.getBoundingClientRect().left || 0 }}
            >
              <button
                onClick={() => { setSettingsMenuOpen(false); onSync() }}
                disabled={syncing}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] text-content-2 hover:bg-surface-3 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3 h-3 ${syncing ? 'animate-spin' : ''}`} />
                Sync Sessions
              </button>
            </div>,
            document.body
          )}
        </div>
      </div>
      {!sidebarCollapsed && (
        <div
          onMouseDown={startResize}
          className="absolute top-0 bottom-0 right-0 w-1.5 cursor-col-resize hover:bg-blue-500/20 z-10"
        />
      )}
    </div>
  )
}

function FilterButton({ active, onClick, onContextMenu, icon, label, count, tooltip }: {
  active: boolean
  onClick: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  icon: React.ReactNode
  label: string
  count?: number
  tooltip?: string
}) {
  const [showTip, setShowTip] = useState(false)
  const [tipPos, setTipPos] = useState({ top: 0, left: 0 })
  const wrapRef = useRef<HTMLDivElement>(null)

  const handleEnter = useCallback(() => {
    if (tooltip && wrapRef.current) {
      const r = wrapRef.current.getBoundingClientRect()
      setTipPos({ top: r.bottom + 4, left: r.left })
      setShowTip(true)
    }
  }, [tooltip])

  const handleLeave = useCallback(() => setShowTip(false), [])

  const btn = (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${active ? 'bg-surface-3/80 text-content' : 'text-content-3 hover:bg-surface-2 hover:text-content-2'}`}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
      {count !== undefined && <span className="ml-auto text-content-4 tabular-nums">{count}</span>}
    </button>
  )

  if (tooltip) {
    return (
      <div ref={wrapRef} onMouseEnter={handleEnter} onMouseLeave={handleLeave}>
        {btn}
        {showTip && createPortal(
          <div className="fixed z-[9999] px-2.5 py-1 rounded bg-surface-3 text-[11px] text-content-2 shadow-lg border border-edge pointer-events-none" style={{ top: tipPos.top, left: tipPos.left }}>
            {tooltip}
          </div>,
          document.body
        )}
      </div>
    )
  }
  return btn
}
