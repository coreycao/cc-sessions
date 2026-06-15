import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LoaderCircle, type LucideIcon } from 'lucide-react'
import { cn } from '../lib/utils'

type ButtonVariant = 'secondary' | 'primary' | 'ghost' | 'accent' | 'danger'
type ButtonSize = 'sm' | 'md' | 'icon-sm' | 'icon-md'

const buttonVariants: Record<ButtonVariant, string> = {
  secondary: 'border border-edge/70 bg-surface text-content-2 shadow-sm hover:border-edge hover:bg-surface-2 hover:text-content',
  primary: 'border border-content bg-content text-surface shadow-sm hover:opacity-90',
  ghost: 'border border-transparent text-content-4 hover:bg-surface-3 hover:text-content-2',
  accent: 'border border-accent/25 bg-accent-subtle/80 text-accent shadow-sm hover:bg-accent-subtle',
  danger: 'border border-transparent text-content-4 hover:bg-red-500/10 hover:text-red-400',
}

const buttonSizes: Record<ButtonSize, string> = {
  sm: 'h-7 gap-1.5 rounded-lg px-2.5 text-[11px]',
  md: 'h-8 gap-2 rounded-lg px-3 text-[12px]',
  'icon-sm': 'h-7 w-7 rounded-lg p-0',
  'icon-md': 'h-8 w-8 rounded-lg p-0',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className,
  disabled,
  ...props
}, ref) {
  return (
    <button
      ref={ref}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-colors disabled:cursor-default disabled:opacity-50',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : icon}
      {children}
    </button>
  )
})

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  variant?: ButtonVariant
  size?: Extract<ButtonSize, 'icon-sm' | 'icon-md'>
  icon: ReactNode
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({
  label,
  variant = 'ghost',
  size = 'icon-sm',
  icon,
  className,
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      aria-label={label}
      title={label}
      variant={variant}
      size={size}
      icon={icon}
      className={className}
      {...props}
    />
  )
})

interface LoadingStateProps {
  title: string
  description?: string
  icon?: LucideIcon
  className?: string
  compact?: boolean
  progress?: boolean
}

export function LoadingState({
  title,
  description,
  icon: Icon,
  className,
  compact = false,
  progress = false,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center text-center',
        compact ? 'gap-2 py-8' : 'gap-3 py-12',
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className={cn(
        'inline-flex items-center justify-center rounded-xl border border-accent/20 bg-accent-subtle text-accent shadow-sm',
        compact ? 'h-8 w-8' : 'h-10 w-10',
      )}>
        {Icon ? <Icon className={cn(compact ? 'h-4 w-4' : 'h-5 w-5')} /> : <LoaderCircle className={cn('animate-spin', compact ? 'h-4 w-4' : 'h-5 w-5')} />}
      </div>
      <div>
        <div className={cn('font-semibold text-content', compact ? 'text-[12px]' : 'text-[13px]')}>{title}</div>
        {description && <div className="mt-1 max-w-[320px] text-[11px] leading-relaxed text-content-4">{description}</div>}
      </div>
      {progress && (
        <div className="h-0.5 w-40 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-accent animate-indeterminate-progress" />
        </div>
      )}
    </div>
  )
}

export function LoadingOverlay({ title, description }: { title: string; description?: string }) {
  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-surface/72 backdrop-blur-sm">
      <div className="min-w-[260px] rounded-xl border border-edge bg-surface px-6 py-2 shadow-2xl">
        <LoadingState title={title} description={description} progress />
      </div>
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  className,
}: {
  icon: LucideIcon
  title: string
  description?: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 text-center', className)}>
      <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-edge bg-surface text-content-5 shadow-sm">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-[13px] font-medium text-content-3">{title}</div>
        {description && <div className="mt-1 text-[11px] text-content-5">{description}</div>}
      </div>
    </div>
  )
}
