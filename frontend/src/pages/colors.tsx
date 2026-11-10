import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUpRight, Check, Copy, Loader2, Palette, Search, SlidersHorizontal, X } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { EmptyState, PageHeader, Pagination } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import { FAMILY_HEX, contrastText, hexToRgb } from '@/lib/colors'
import type { ColorGroup, FamilyCount, Paged } from '@/lib/types'
import { cn, copyText, formatPrice } from '@/lib/utils'

function ColorCard({ color, onOpen }: { color: ColorGroup; onOpen: () => void }) {
  const [copied, setCopied] = React.useState(false)
  const copy = async (event: React.MouseEvent) => {
    event.stopPropagation()
    if (await copyText(color.hex)) {
      setCopied(true)
      toast.success('色值已复制', { description: color.hex })
      window.setTimeout(() => setCopied(false), 1400)
    } else {
      toast.error('复制失败，请手动选择文本')
    }
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative flex h-[142px] flex-col justify-between overflow-hidden rounded-xl p-3 text-left shadow-sm ring-1 ring-inset ring-black/[0.06] transition-transform hover:-translate-y-0.5 hover:shadow-mac"
      style={{ backgroundColor: color.hex, color: color.text_color || contrastText(color.hex) }}
    >
      <div className="flex w-full items-start justify-between gap-1">
        <span className="rounded-full bg-black/10 px-2 py-0.5 text-[9.5px] font-medium backdrop-blur-sm">{color.family}色系</span>
        <div className="flex items-center gap-1">
          {typeof color.distance === 'number' && (
            <span className="rounded-full bg-black/10 px-2 py-0.5 text-[9.5px] font-medium backdrop-blur-sm">
              ΔE {color.distance.toFixed(1)}
            </span>
          )}
          <span
            role="button"
            tabIndex={0}
            onClick={copy}
            onKeyDown={(event) => {
              if (event.key === 'Enter') copy(event as unknown as React.MouseEvent)
            }}
            className="grid h-6 w-6 place-items-center rounded-full bg-black/10 opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            aria-label="复制色值"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </span>
        </div>
      </div>
      <div className="w-full">
        <div className="font-mono text-[13px] font-semibold tracking-wide">{color.hex}</div>
        <div className="mt-0.5 truncate text-[10px] opacity-85">{color.name || '未命名色号'}</div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[9.5px] opacity-70">
          <span className="truncate">{color.shop_name}</span>
          <span className="shrink-0">{color.count} 件</span>
        </div>
      </div>
    </button>
  )
}

export function ColorsPage() {
  const { permissions } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = React.useState<Paged<ColorGroup> | null>(null)
  const [families, setFamilies] = React.useState<FamilyCount[]>([])
  const [family, setFamily] = React.useState('')
  const [query, setQuery] = React.useState('')
  const [sort, setSort] = React.useState<'shop' | 'code'>('shop')
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [active, setActive] = React.useState<ColorGroup | null>(null)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.colors.list({ family, q: query, sort, page, page_size: 60 })
      setData(response)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '色卡加载失败')
    } finally {
      setLoading(false)
    }
  }, [family, query, sort, page])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    api.colors
      .families()
      .then((response) => setFamilies(response.items))
      .catch(() => undefined)
  }, [])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const totalFamilies = families.length
  const totalColors = data?.total ?? 0
  const activeFamilyCount = family ? families.find((item) => item.family === family)?.count || 0 : 0
  const hexSearch = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.test(query.trim())

  return (
    <div className="space-y-4">
      <PageHeader
        title="色卡库"
        description={
          hexSearch
            ? `${totalColors} 个店铺色，正按与 ${query.trim().startsWith('#') ? query.trim() : `#${query.trim()}`} 的色差从近到远排列。`
            : `${totalColors} 个店铺色，归入 ${totalFamilies || 13} 个色系。同一店铺同色只保留一张，不同店铺分别展示；点击色块查看 Lab 值与来源商品。`
        }
        actions={
          <div className="flex items-center gap-1.5 rounded-lg border border-border/70 bg-card p-0.5">
            <button
              type="button"
              disabled={hexSearch}
              title={hexSearch ? '输入色号时按色差排序' : undefined}
              onClick={() => {
                setSort('shop')
                setPage(1)
              }}
              className={cn('rounded-md px-2.5 py-1.5 text-[11px] disabled:opacity-40', sort === 'shop' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}
            >
              按商店
            </button>
            <button
              type="button"
              disabled={hexSearch}
              title={hexSearch ? '输入色号时按色差排序' : undefined}
              onClick={() => {
                setSort('code')
                setPage(1)
              }}
              className={cn('rounded-md px-2.5 py-1.5 text-[11px] disabled:opacity-40', sort === 'code' ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground')}
            >
              按色号
            </button>
          </div>
        }
      />

      <div className="card-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1 sm:max-w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索色名 / HEX / 店铺…"
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setFamily('')
                setPage(1)
              }}
              className={cn(
                'flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10.5px] transition-colors',
                !family ? 'border-foreground/15 bg-foreground text-background' : 'border-border/70 text-muted-foreground hover:text-foreground',
              )}
            >
              <SlidersHorizontal className="h-2.5 w-2.5" />
              全部
            </button>
            {families.map((item) => (
              <button
                key={item.family}
                type="button"
                onClick={() => {
                  setFamily(family === item.family ? '' : item.family)
                  setPage(1)
                }}
                className={cn(
                  'flex items-center gap-1 rounded-full border px-2 py-1 text-[10.5px] transition-colors',
                  family === item.family
                    ? 'border-foreground/15 bg-foreground text-background'
                    : 'border-border/70 text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                )}
              >
                <span className="h-2 w-2 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: FAMILY_HEX[item.family] || '#CCC' }} />
                {item.family}
                <span className="opacity-60">{item.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {family && (
        <div className="flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span>
            正在查看 <span className="font-medium text-foreground">{family}色系</span>
            {activeFamilyCount ? `，共 ${activeFamilyCount} 种色号` : ''}
          </span>
          <button type="button" onClick={() => setFamily('')} className="flex items-center gap-0.5 text-primary hover:underline">
            <X className="h-3 w-3" /> 清除
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {Array.from({ length: 12 }).map((_, index) => (
            <Skeleton key={index} className="h-[142px] rounded-xl" />
          ))}
        </div>
      ) : !data?.items.length ? (
        <EmptyState
          icon={Palette}
          title={query || family ? '没有找到对应的色号' : '色卡库还是空的'}
          description={
            query || family
              ? '换个关键词或色系试试；色号来自商品库中登记的颜色。'
              : '在商品库添加带色号的商品后，这里会自动汇总成色卡。'
          }
          action={
            <Button size="sm" variant="outline" onClick={() => navigate('/products')}>
              去商品库
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
          {data.items.map((color) => (
            <ColorCard key={`${color.shop_name}-${color.hex}-${color.name}`} color={color} onOpen={() => setActive(color)} />
          ))}
        </div>
      )}

      {data && data.total > 60 && (
        <div className="card-surface px-4 pb-3">
          <Pagination page={page} pages={data.pages} total={data.total} pageSize={60} onChange={setPage} />
        </div>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent className="max-w-[460px]">
          {active && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-6 text-[15px]">{active.name || '未命名色号'}</DialogTitle>
                <DialogDescription>
                  {active.shop_name} · {active.family}色系 · 被 {active.count} 件商品使用
                  {typeof active.distance === 'number' ? ` · 与搜索色 ΔE ${active.distance.toFixed(1)}` : ''}
                </DialogDescription>
              </DialogHeader>
              <div
                className="flex h-[132px] flex-col justify-between rounded-xl p-4 ring-1 ring-inset ring-black/10"
                style={{ backgroundColor: active.hex, color: active.text_color || contrastText(active.hex) }}
              >
                <div className="text-[10px] uppercase tracking-wide opacity-70">PlushColor · {active.family}</div>
                <div>
                  <div className="font-mono text-[22px] font-semibold tracking-wide">{active.hex}</div>
                  <div className="mt-1 text-[11px] opacity-75">
                    RGB {active ? `${hexToRgb(active.hex).r}, ${hexToRgb(active.hex).g}, ${hexToRgb(active.hex).b}` : ''}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  { label: 'L*', value: active.lab.l.toFixed(1) },
                  { label: 'a*', value: active.lab.a.toFixed(1) },
                  { label: 'b*', value: active.lab.b.toFixed(1) },
                ].map((item) => (
                  <div key={item.label} className="rounded-lg border border-border/60 bg-muted/25 py-2">
                    <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{item.label}</div>
                    <div className="mt-0.5 font-mono text-[12px] font-medium">{item.value}</div>
                  </div>
                ))}
              </div>

              {active.sample?.title && (
                <div className="rounded-xl border border-border/60 p-2.5">
                  <div className="mb-1.5 text-[10px] text-muted-foreground">使用这个色号的商品</div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2.5">
                    <div className="h-11 w-11 overflow-hidden rounded-lg bg-muted">
                      {active.sample.image_url && <img src={active.sample.image_url} alt={active.sample.title} className="h-full w-full object-cover" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11.5px] font-medium">{active.sample.title}</div>
                      <div className="text-[10.5px] text-muted-foreground">
                        {active.sample.shop_name} · {formatPrice(active.sample.price_cents)}
                      </div>
                    </div>
                    {active.sample.product_url && (
                      <Button asChild size="sm" variant="outline" className="h-7 text-[10.5px]">
                        <a href={active.sample.product_url} target="_blank" rel="noreferrer noopener">
                          购买
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </Button>
                    )}
                    {permissions.can_manage && active.sample.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10.5px]"
                        onClick={() => {
                          setActive(null)
                          navigate(`/products?edit=${active.sample.id}`)
                        }}
                      >
                        查看
                        <ArrowUpRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    if (await copyText(active.hex)) toast.success('色值已复制')
                    else toast.error('复制失败，请手动选择文本')
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> 复制 HEX
                </Button>
                <Button size="sm" onClick={() => navigate(`/finder?hex=${active.hex.replace('#', '')}`)}>
                  用这个颜色找毛布
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
