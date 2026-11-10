import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatPrice(cents: number | null | undefined, currency = 'CNY'): string {
  if (cents === null || cents === undefined) return '—'
  const symbol = currency === 'CNY' ? '¥' : currency === 'USD' ? '$' : ''
  return `${symbol}${(cents / 100).toFixed(2)}`
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '—'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '—'
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
  return withTime ? `${base} ${pad(date.getHours())}:${pad(date.getMinutes())}` : base
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  if (Number.isNaN(diff)) return '—'
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`
  return formatDate(iso)
}

export function initials(name: string): string {
  const trimmed = (name || '').trim()
  if (!trimmed) return '?'
  const chars = Array.from(trimmed)
  return chars.slice(0, 2).join('').toUpperCase()
}

export function truncate(value: string, length = 40): string {
  if (!value) return ''
  const chars = Array.from(value)
  return chars.length > length ? `${chars.slice(0, length).join('')}…` : value
}

export function uid(prefix = 'id'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

export function safeUrl(url: string): string | undefined {
  if (!url) return undefined
  if (/^https?:\/\//i.test(url) || url.startsWith('/')) return url
  return undefined
}

export function downloadText(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type: `${type};charset=utf-8` })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(link.href), 2000)
}

/**
 * 复制文本到剪贴板。
 * 局域网通过 http://IP 访问时不是 secure context，navigator.clipboard 不可用，
 * 此时回退到 textarea + execCommand('copy')。
 */
export async function copyText(text: string): Promise<boolean> {
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // 浏览器拒绝（无权限/失去焦点）时继续走回退方案
    }
  }
  try {
    const active = document.activeElement as HTMLElement | null
    // 弹窗内 Radix FocusScope 会把焦点拉回弹窗，textarea 必须放在同一焦点域内，
    // 否则 select() 后立即失焦，execCommand 复制到的是空内容。
    const container = active?.closest('[role="dialog"], [role="alertdialog"]') || document.body
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.top = '-1000px'
    area.style.left = '-1000px'
    area.style.opacity = '0'
    container.appendChild(area)
    area.focus()
    area.select()
    area.setSelectionRange(0, area.value.length)
    const ok = document.execCommand('copy')
    // 立即移除 textarea 会让 Chromium 在部分场景下丢失本次复制内容，延后清理。
    window.setTimeout(() => {
      area.remove()
      active?.focus?.()
    }, 150)
    return ok
  } catch {
    return false
  }
}
