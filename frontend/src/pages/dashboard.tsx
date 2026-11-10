import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowUpRight,
  ChevronRight,
  Clock3,
  Layers,
  Package,
  Palette,
  Pipette,
  Plus,
  Sparkles,
  Store,
  TrendingUp,
  Upload,
} from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { FAMILY_HEX, contrastText } from '@/lib/colors'
import type { RecommendHistoryItem, Stats } from '@/lib/types'
import { cn, formatPrice, relativeTime } from '@/lib/utils'

function greeting(): string {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 9) return '早上好'
  if (hour < 12) return '上午好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tint,
}: {
  icon: React.ElementType
  label: string
  value: React.ReactNode
  hint: React.ReactNode
  tint: string
}) {
  return (
    <div className="card-surface flex items-start gap-3.5 p-4">
      <div className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-[10px]', tint)}>
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-[22px] font-semibold leading-none tracking-[-0.03em] tnum">{value}</div>
        <div className="mt-1.5 truncate text-[10.5px] text-muted-foreground">{hint}</div>
      </div>
    </div>
  )
}

function TrendChart({ daily }: { daily: Stats['daily'] }) {
  const max = Math.max(1, ...daily.map((day) => day.count))
  const total = daily.reduce((sum, day) => sum + day.count, 0)
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <div className="text-[13px] font-semibold">近 7 天选色趋势</div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            共 {total} 次匹配{total > 0 ? '，每一次都会记录用色偏好' : '，去「找色匹配」试一次吧'}
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10.5px] text-emerald-600 dark:text-emerald-400">
          <TrendingUp className="h-3 w-3" />
          本地统计
        </div>
      </div>
      <div className="relative flex h-[132px] items-end gap-2.5">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-border/60" />
        <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed border-border/60" />
        {daily.map((day, index) => {
          const height = day.count === 0 ? 3 : Math.max(10, Math.round((day.count / max) * 112))
          const isToday = index === daily.length - 1
          return (
            <div key={day.date} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
              <div className="relative flex w-full flex-1 items-end justify-center">
                <div
                  className={cn(
                    'w-full max-w-[34px] rounded-t-[5px] transition-all',
                    isToday ? 'bg-primary' : 'bg-primary/25 group-hover:bg-primary/40',
                  )}
                  style={{ height }}
                  title={`${day.date}：${day.count} 次`}
                />
                {day.count > 0 && (
                  <span className="absolute -top-0.5 text-[10px] font-medium text-muted-foreground tnum">{day.count}</span>
                )}
              </div>
              <span className={cn('text-[10px] tnum', isToday ? 'font-semibold text-foreground' : 'text-muted-foreground/80')}>
                {day.date}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function FamilyBars({ families }: { families: Stats['families'] }) {
  const items = families.slice(0, 7)
  const max = Math.max(1, ...items.map((item) => item.count))
  if (!items.length) {
    return <div className="py-8 text-center text-[12px] text-muted-foreground">还没有色号数据</div>
  }
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.family} className="flex items-center gap-2.5">
          <span className="w-8 shrink-0 text-[11px] text-muted-foreground">{item.family}</span>
          <div className="h-[7px] flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${Math.max(6, (item.count / max) * 100)}%`, backgroundColor: FAMILY_HEX[item.family] || '#B6B6BA' }}
            />
          </div>
          <span className="w-7 shrink-0 text-right text-[10.5px] text-muted-foreground tnum">{item.count}</span>
        </div>
      ))}
    </div>
  )
}

export function DashboardPage() {
  const { user, permissions } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = React.useState<Stats | null>(null)
  const [history, setHistory] = React.useState<RecommendHistoryItem[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    let alive = true
    Promise.allSettled([api.stats(), api.recommend.history(5)])
      .then(([statsResult, historyResult]) => {
        if (!alive) return
        if (statsResult.status === 'fulfilled') setStats(statsResult.value)
        if (historyResult.status === 'fulfilled') setHistory(historyResult.value.items)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const name = user?.display_name || user?.username || ''
  const products = stats?.products
  const recommendationCount = stats?.recommendations.last_7d ?? 0

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[18px] border border-black/5 bg-[#141416] p-5 text-white shadow-mac lg:p-7">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 90% at 8% 0%, rgba(10,132,255,0.32), transparent 55%), radial-gradient(60% 80% at 92% 100%, rgba(255,159,10,0.22), transparent 60%)',
          }}
        />
        <div className="relative grid items-center gap-7 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-medium tracking-wide text-white/65">
              <Sparkles className="h-3 w-3" />
              {greeting()}，{name}
            </div>
            <h2 className="mt-3 text-[26px] font-semibold leading-[1.2] tracking-[-0.035em] lg:text-[30px]">
              今天，从一张照片开始找色。
            </h2>
            <p className="mt-2 max-w-[420px] text-[12px] leading-relaxed text-white/55">
              上传图片、用滴管取一个颜色，剩下的交给色差算法。需要更懂业务的解释时，再让 AI 帮你重排。
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2.5">
              <Button
                className="h-9 bg-white px-4 text-[12.5px] text-[#1D1D1F] hover:bg-white/90"
                onClick={() => navigate('/finder')}
              >
                <Pipette className="h-3.5 w-3.5" />
                开始找色
              </Button>
              {permissions.can_manage && (
                <>
                  <Button
                    variant="ghost"
                    className="h-9 border border-white/15 bg-white/5 px-3.5 text-[12.5px] text-white/85 hover:bg-white/10 hover:text-white"
                    onClick={() => navigate('/products?new=1')}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    添加商品
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9 px-2 text-[12px] text-white/55 hover:bg-white/10 hover:text-white"
                    onClick={() => navigate('/import')}
                  >
                    <Upload className="h-3.5 w-3.5" />
                    导入
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="hidden lg:block">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <div className="mb-3 flex items-center justify-between text-[10px] text-white/45">
                <span>本次参考色</span>
                <span className="font-mono">ΔE 0.0</span>
              </div>
              <div className="flex h-[74px] overflow-hidden rounded-lg">
                {['#E9DDC7', '#CBB79A', '#9AA7A0', '#6E7F73', '#33413A'].map((color) => (
                  <div key={color} className="flex-1" style={{ backgroundColor: color }} />
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between">
                <span className="font-mono text-[11px] tracking-wide text-white/75">#CBB79A</span>
                <span className="rounded-full bg-emerald-400/15 px-2 py-0.5 text-[9.5px] font-medium text-emerald-300">
                  燕麦 · 米色系
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3.5 xl:grid-cols-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[86px] rounded-xl" />)
        ) : (
          <>
            <StatCard
              icon={Package}
              label="商品总数"
              value={products?.total ?? 0}
              hint={`在售 ${products?.active ?? 0} · 草稿 ${products?.draft ?? 0}`}
              tint="bg-primary/10 text-primary"
            />
            <StatCard
              icon={Palette}
              label="色号总数"
              value={stats?.colors.distinct ?? 0}
              hint={`累计 ${stats?.colors.total ?? 0} 条色号记录`}
              tint="bg-[#FF9F0A]/10 text-[#C77700] dark:text-[#FFB340]"
            />
            <StatCard
              icon={Store}
              label="合作店铺"
              value={stats?.shops ?? 0}
              hint={(stats?.shop_distribution || []).map((item) => item.shop).slice(0, 2).join(' · ') || '尚未导入店铺'}
              tint="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            />
            <StatCard
              icon={Sparkles}
              label="近 7 天匹配"
              value={recommendationCount}
              hint={`AI 参与 ${stats?.recommendations.ai_last_7d ?? 0} 次`}
              tint="bg-[#5E5CE6]/10 text-[#5E5CE6] dark:text-[#8E8CFF]"
            />
          </>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div className="card-surface p-5">{loading ? <Skeleton className="h-[196px]" /> : <TrendChart daily={stats?.daily || []} />}</div>
        <div className="card-surface p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-[13px] font-semibold">色系分布</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">全部色号按 13 个色系归类</div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/colors')}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              色卡库 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? <Skeleton className="h-[150px]" /> : <FamilyBars families={stats?.families || []} />}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <div>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold tracking-tight">最近加入的商品</h3>
              <p className="mt-0.5 text-[11px] text-muted-foreground">新导入或手工添加的毛布</p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/products')}
              className="flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              查看全部 <ChevronRight className="h-3 w-3" />
            </button>
          </div>
          {loading ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[112px] rounded-xl" />
              ))}
            </div>
          ) : stats?.recent_products?.length ? (
            <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {stats.recent_products.slice(0, 6).map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => navigate(`/products?edit=${product.id}`)}
                  className="card-surface hover-lift group flex items-center gap-3 p-2.5 text-left"
                >
                  <div className="h-[62px] w-[62px] shrink-0 overflow-hidden rounded-lg bg-muted">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.title} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          background: `linear-gradient(135deg, ${product.colors.map((color) => color.hex).join(', ') || '#DDD'})`,
                        }}
                      />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-medium">{product.display_name || product.title}</div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                      <span className="truncate">{product.shop_name || '未标注店铺'}</span>
                      <span>·</span>
                      <span className="truncate">{product.material || '毛布'}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-[12px] font-semibold tnum">{formatPrice(product.price_cents)}</span>
                      <div className="flex items-center gap-1">
                        {product.colors.slice(0, 3).map((color) => (
                          <span
                            key={color.id}
                            className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-black/10"
                            style={{ backgroundColor: color.hex }}
                            title={`${color.name} ${color.hex}`}
                          />
                        ))}
                        <StatusBadge status={product.status} />
                      </div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card-surface flex flex-col items-center justify-center py-10 text-center">
              <Layers className="mb-2 h-6 w-6 text-muted-foreground/50" strokeWidth={1.6} />
              <div className="text-[12.5px] font-medium">商品库还是空的</div>
              <p className="mt-1 text-[11px] text-muted-foreground">先从淘宝导入真实商品，或手动添加第一件毛布。</p>
              {permissions.can_manage && (
                <Button size="sm" className="mt-3" onClick={() => navigate('/import')}>
                  <Upload className="h-3.5 w-3.5" /> 去导入
                </Button>
              )}
            </div>
          )}
        </div>

        <div className="card-surface p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <div className="text-[13px] font-semibold">最近匹配记录</div>
              <div className="mt-0.5 text-[11px] text-muted-foreground">找回上次选过的颜色</div>
            </div>
            <Clock3 className="h-4 w-4 text-muted-foreground/60" />
          </div>
          {loading ? (
            <div className="space-y-2.5">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-12 rounded-lg" />
              ))}
            </div>
          ) : history.length ? (
            <div className="space-y-1">
              {history.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => navigate(`/finder?hex=${item.hex.replace('#', '')}`)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[9px] font-medium ring-1 ring-inset ring-black/10"
                    style={{ backgroundColor: item.hex, color: contrastText(item.hex) }}
                  >
                    {item.mode === 'ai' ? 'AI' : 'L'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[11.5px] font-medium">{item.hex}</span>
                      <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">
                        {item.mode === 'ai' ? 'AI 重排' : item.mode === 'local_fallback' ? '回退本地' : '本地算法'}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[10.5px] text-muted-foreground">
                      {item.count} 个候选 · {relativeTime(item.created_at)}
                    </div>
                  </div>
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <Pipette className="mb-2 h-6 w-6 text-muted-foreground/50" strokeWidth={1.6} />
              <div className="text-[12.5px] font-medium">还没有匹配记录</div>
              <p className="mt-1 text-[11px] text-muted-foreground">取一次颜色，这里就会留下足迹。</p>
              <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/finder')}>
                去试试
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
