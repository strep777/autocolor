import * as React from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Loader2 } from 'lucide-react'

import { cn, formatPrice } from '@/lib/utils'
import type { Product, ProductColor } from '@/lib/types'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
}) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0">
        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.025em]">{title}</h1>
        {description && <p className="mt-1.5 max-w-[680px] text-[12.5px] leading-relaxed text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionTitle({
  title,
  children,
  className,
}: {
  title?: React.ReactNode
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('mb-3 text-[12.5px] font-semibold tracking-tight', className)}>{title ?? children}</div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      {Icon && (
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-muted/70 text-muted-foreground">
          <Icon className="h-5 w-5" />
        </div>
      )}
      <div className="text-[13.5px] font-medium">{title}</div>
      {description && <div className="mt-1.5 max-w-[360px] text-[11.5px] leading-relaxed text-muted-foreground">{description}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ColorDot({ hex, size = 12, className }: { hex: string; size?: number; className?: string }) {
  return (
    <span
      className={cn('inline-block shrink-0 rounded-full ring-1 ring-black/10 dark:ring-white/15', className)}
      style={{ backgroundColor: hex, width: size, height: size }}
      title={hex}
    />
  )
}

const STATUS_STYLE: Record<string, { label: string; className: string; dot: string }> = {
  active: { label: '在售', className: 'text-emerald-600 dark:text-emerald-400', dot: 'bg-emerald-500' },
  draft: { label: '草稿', className: 'text-amber-600 dark:text-amber-400', dot: 'bg-amber-500' },
  archived: { label: '已归档', className: 'text-muted-foreground', dot: 'bg-muted-foreground/50' },
}

export function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLE[status] || { label: status, className: 'text-muted-foreground', dot: 'bg-muted-foreground/50' }
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] font-medium', style.className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', style.dot)} />
      {style.label}
    </span>
  )
}

export function ProductThumb({
  product,
  className,
  rounded = 'rounded-lg',
}: {
  product: Product
  className?: string
  rounded?: string
}) {
  const [broken, setBroken] = React.useState(false)
  React.useEffect(() => setBroken(false), [product.image_url])

  const colors = product.colors || []
  const stops = colors.length
    ? colors.slice(0, 3).map((color: ProductColor, index: number) => `${color.hex} ${Math.round((index / Math.max(colors.length, 1)) * 100)}%`).join(', ')
    : 'linear-gradient(135deg, #e8e2d6, #b9c2bd)'

  return (
    <div className={cn('relative overflow-hidden bg-muted', rounded, className)}>
      {product.image_url && !broken ? (
        <img
          src={product.image_url}
          alt={product.title}
          loading="lazy"
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        <div
          className="flex h-full w-full items-end p-1.5"
          style={{ background: colors.length ? `linear-gradient(135deg, ${stops})` : stops }}
        >
          <span className="line-clamp-2 text-[8px] font-medium leading-tight text-black/45 mix-blend-multiply dark:text-white/55">
            {product.title.slice(0, 10)}
          </span>
        </div>
      )}
    </div>
  )
}

export function Pagination({
  page,
  pages,
  total,
  pageSize,
  onChange,
}: {
  page: number
  pages: number
  total: number
  pageSize: number
  onChange: (page: number) => void
}) {
  if (total <= 0) return null
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, total)
  const numbers: number[] = []
  const from = Math.max(1, Math.min(page - 2, pages - 4))
  const to = Math.min(pages, from + 4)
  for (let i = from; i <= to; i += 1) numbers.push(i)

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="text-[10.5px] text-muted-foreground">
        第 {start}–{end} 项 · 共 {total} 项
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="上一页">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {from > 1 && <span className="px-1 text-[10.5px] text-muted-foreground">…</span>}
        {numbers.map((number) => (
          <button
            key={number}
            type="button"
            onClick={() => onChange(number)}
            className={cn(
              'h-7 min-w-7 rounded-md px-2 text-[11px] font-medium transition-colors',
              number === page ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {number}
          </button>
        ))}
        {to < pages && <span className="px-1 text-[10.5px] text-muted-foreground">…</span>}
        <Button variant="ghost" size="icon-sm" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="下一页">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  cancelLabel = '取消',
  destructive,
  loading,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <Button variant="ghost" size="sm" disabled={loading}>
              {cancelLabel}
            </Button>
          </AlertDialogCancel>
          <Button variant={destructive ? 'destructive' : 'default'} size="sm" disabled={loading} onClick={onConfirm}>
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function InfoRow({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-2 last:border-0">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <span className="text-right text-[11.5px] font-medium">{value}</span>
    </div>
  )
}

export function Price({ cents }: { cents?: number | null }) {
  return <span className="font-medium tnum">{formatPrice(cents)}</span>
}

export function ImagePlaceholder({ className }: { className?: string }) {
  return (
    <div className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
      <ImageIcon className="h-4 w-4" />
    </div>
  )
}
