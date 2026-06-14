import type { MouseEvent } from 'react'
import { Check } from 'lucide-react'
import { cn } from '../lib/utils'

interface CheckboxProps {
  checked: boolean
  onClick?: (e: MouseEvent) => void
  className?: string
  title?: string
  sizeClass?: string
}

/**
 * Soft, rounded checkbox shared by session-list batch select and message
 * multi-select. Matches the app's rounded aesthetic — accent-filled with a
 * crisp check when selected, subtle outlined pill otherwise.
 */
export function Checkbox({ checked, onClick, className, title, sizeClass = 'h-4 w-4' }: CheckboxProps) {
  return (
    <span
      role="checkbox"
      aria-checked={checked}
      title={title}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(e) } : undefined}
      className={cn(
        'flex flex-shrink-0 cursor-pointer items-center justify-center rounded-md border transition-all duration-150',
        sizeClass,
        checked
          ? 'border-accent bg-accent text-white shadow-sm'
          : 'border-content-5/40 bg-surface-2/40 text-transparent hover:border-accent/60 hover:bg-surface-3/60',
        className,
      )}
    >
      {checked && <Check className="h-[11px] w-[11px]" strokeWidth={3.5} />}
    </span>
  )
}
