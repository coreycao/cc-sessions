import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Bookmark, BookmarkMinus, Copy, FileDown } from 'lucide-react'
import { useI18n } from '../lib/i18n'

interface MenuItem {
  label: string
  icon: React.ReactNode
  onClick: () => void
  danger?: boolean
}

interface MessageContextMenuProps {
  x: number
  y: number
  isSaved: boolean
  onSave: () => void
  onUnsave: () => void
  onCopy: () => void
  onExport: () => void
  onClose: () => void
}

export function MessageContextMenu({ x, y, isSaved, onSave, onUnsave, onCopy, onExport, onClose }: MessageContextMenuProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKey)
    }
  }, [onClose])

  const items: MenuItem[] = [
    isSaved
      ? { label: t('session.unsaveMessage'), icon: <BookmarkMinus className="w-3.5 h-3.5" />, onClick: () => { onUnsave(); onClose() } }
      : { label: t('session.saveMessage'), icon: <Bookmark className="w-3.5 h-3.5" />, onClick: () => { onSave(); onClose() } },
    { label: t('session.copy'), icon: <Copy className="w-3.5 h-3.5" />, onClick: () => { onCopy(); onClose() } },
    { label: t('detail.exportMarkdown'), icon: <FileDown className="w-3.5 h-3.5" />, onClick: () => { onExport(); onClose() } },
  ]

  return createPortal(
    <div
      ref={ref}
      className="fixed z-[9999] bg-surface-2 border border-edge rounded-lg shadow-xl py-1 min-w-[180px]"
      style={{ top: y, left: x }}
    >
      {items.map((item, i) => (
        <button
          key={i}
          onClick={item.onClick}
          className={`w-full flex items-center gap-2 px-3 py-1.5 text-[11px] transition-colors text-content-2 hover:bg-surface-3 hover:text-content`}
        >
          <span className="text-content-4">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>,
    document.body,
  )
}
