import * as React from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import introJs from 'intro.js'
import 'intro.js/introjs.css'
import {
  ChevronDown,
  Compass,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  Moon,
  Package,
  Palette,
  Pipette,
  Settings,
  Sparkles,
  Sun,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { useTheme } from '@/components/theme-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { FinderPage } from '@/pages/finder'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/sonner'
import { api } from '@/lib/api'
import type { AIStatus } from '@/lib/types'
import { cn, initials } from '@/lib/utils'

const NAV_MAIN = [
  { to: '/dashboard', label: '工作台', icon: LayoutDashboard, tour: 'nav-dashboard' },
  { to: '/finder', label: '找色匹配', icon: Pipette, tour: 'nav-finder' },
]

const NAV_LIBRARY = [
  { to: '/products', label: '商品库', icon: Package, tour: 'nav-products' },
  { to: '/colors', label: '色卡库', icon: Palette, tour: 'nav-colors' },
  { to: '/import', label: '数据导入', icon: Upload, tour: 'nav-import', adminOnly: true },
]

const NAV_SYSTEM = [
  { to: '/settings', label: '设置', icon: Settings, tour: 'nav-settings' },
  { to: '/users', label: '用户管理', icon: Users, tour: 'nav-users', adminOnly: true },
]

const TITLES: Record<string, { title: string; hint: string }> = {
  '/dashboard': { title: '工作台', hint: '今天想找什么颜色？' },
  '/finder': { title: '找色匹配', hint: '上传图片，用滴管取色，找到最接近的毛布' },
  '/products': { title: '商品库', hint: '管理毛布商品、色号与购买链接' },
  '/colors': { title: '色卡库', hint: '按色系统览全部在售色号' },
  '/import': { title: '数据导入', hint: '从 JSON / CSV 批量导入商品' },
  '/settings': { title: '设置', hint: '外观、AI 与账户安全' },
  '/users': { title: '用户管理', hint: '成员账号与权限' },
}

function NavItem({
  item,
  onNavigate,
}: {
  item: { to: string; label: string; icon: React.ElementType; tour?: string; adminOnly?: boolean }
  onNavigate: () => void
}) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      data-tour={item.tour}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-muted-foreground hover:bg-foreground/[0.04] hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <Icon className={cn('h-[17px] w-[17px]', isActive ? 'text-primary' : 'text-muted-foreground/80')} strokeWidth={1.9} />
          <span className="truncate">{item.label}</span>
        </>
      )}
    </NavLink>
  )
}

function TrafficLights() {
  return (
    <div className="flex items-center gap-2" aria-hidden="true">
      <span className="traffic-light bg-[#FF5F57]" />
      <span className="traffic-light bg-[#FEBC2E]" />
      <span className="traffic-light bg-[#28C840]" />
    </div>
  )
}

function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('relative grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-[#1D1D1F] shadow-sm', className)}>
      <span className="absolute left-[7px] top-[8px] h-[10px] w-[10px] rounded-full bg-[#F3E9D2]" />
      <span className="absolute right-[7px] top-[8px] h-[10px] w-[10px] rounded-full bg-[#0A84FF]" />
      <span className="absolute bottom-[7px] left-1/2 h-[11px] w-[11px] -translate-x-1/2 rounded-full bg-[#FF9F0A]" />
    </div>
  )
}

function AiStatus({ status }: { status: AIStatus | null }) {
  const ready = status?.enabled && status?.configured
  return (
    <NavLink
      to="/settings?tab=ai"
      data-tour="ai-status"
      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:bg-foreground/[0.04]"
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          ready ? 'bg-emerald-500' : status?.enabled ? 'bg-amber-500' : 'bg-muted-foreground/40',
        )}
      />
      <span className="truncate">
        {ready ? `AI 就绪 · ${status?.model}` : status?.enabled ? 'AI 待配置 API Key' : 'AI 已关闭 · 本地算法'}
      </span>
    </NavLink>
  )
}

export function AppShell() {
  const { user, permissions, logout } = useAuth()
  const { resolvedTheme, toggle } = useTheme()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = React.useState(false)
  const [aiStatus, setAiStatus] = React.useState<AIStatus | null>(null)

  const meta = TITLES[location.pathname] || { title: '毛布选色', hint: '' }
  const isFinder = location.pathname === '/finder'

  React.useEffect(() => {
    api.ai
      .status()
      .then(setAiStatus)
      .catch(() => setAiStatus(null))
  }, [location.pathname])

  React.useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  React.useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const startTour = React.useCallback(() => {
    const candidates: { selector: string; title: string; intro: string }[] = [
      {
        selector: '[data-tour="brand"]',
        title: '欢迎来到色研所',
        intro: '这里把「图片取色 → 色号匹配 → 商品购买」串成一条线。花 30 秒认识一下主要区域。',
      },
      {
        selector: '[data-tour="nav-finder"]',
        title: '找色匹配',
        intro: '上传一张有毛布的图片，用滴管吸取目标颜色，系统会按 CIEDE2000 色差给你排序，AI 还能解释每个推荐的理由。',
      },
      {
        selector: '[data-tour="nav-products"]',
        title: '商品库',
        intro: '所有毛布商品都在这里。支持搜索、筛选、全选当前页或全选筛选结果，再批量上架、下架或删除。',
      },
      {
        selector: '[data-tour="nav-colors"]',
        title: '色卡库',
        intro: '按白、米、灰、棕等 13 个色系统览在售色号，点开色块能看到它出现在哪些商品上。',
      },
      ...(permissions.can_manage
        ? [
            {
              selector: '[data-tour="nav-import"]',
              title: '数据导入',
              intro: '从淘宝导出或自建 JSON / CSV，先预览校验再正式导入。真实商品数据可随 data/ 一起备份。',
            },
          ]
        : []),
      {
        selector: '[data-tour="ai-status"]',
        title: 'AI 与本地双通道',
        intro: '推荐默认走本地算法，也可以切到 DeepSeek 或 Ollama。AI 只做重排和解释，失败会自动回退，不影响你拿到结果。',
      },
      {
        selector: '[data-tour="tour-button"]',
        title: '随时重看指引',
        intro: '忘了哪个按钮？点这里可以再次打开这份新手指引，不会影响你的数据。',
      },
      {
        selector: '[data-tour="user-menu"]',
        title: '账户与安全',
        intro: '在右上角可以切换深浅色、修改密码或退出登录。管理员还能在这里进入用户管理。',
      },
    ]

    const steps = candidates
      .filter((step) => {
        const element = document.querySelector(step.selector)
        return element && (element as HTMLElement).offsetParent !== null
      })
      .map((step) => ({ element: step.selector, title: step.title, intro: step.intro }))

    if (!steps.length) {
      toast.error('当前窗口太窄，暂时无法展示指引', { description: '请把窗口拉宽到 1024px 以上再试。' })
      return
    }

    const tour = introJs()
    tour
      .setOptions({
        steps,
        nextLabel: '下一步',
        prevLabel: '上一步',
        doneLabel: '开始使用',
        skipLabel: '跳过',
        showProgress: true,
        showBullets: false,
        exitOnEsc: true,
        exitOnOverlayClick: false,
        scrollToElement: true,
        tooltipPosition: 'auto',
        helperElementPadding: 6,
        disableInteraction: true,
      })
      .oncomplete(() => {
        localStorage.setItem('pc-tour-done-v1', '1')
        toast.success('指引完成，开始找色吧')
      })
      .onexit(() => {
        localStorage.setItem('pc-tour-done-v1', '1')
      })
      .start()
  }, [permissions.can_manage])

  React.useEffect(() => {
    if (!user) return
    const done = localStorage.getItem('pc-tour-done-v1')
    if (done) return
    if (window.innerWidth < 1024) return
    const timer = window.setTimeout(() => {
      localStorage.setItem('pc-tour-seen-v1', '1')
      startTour()
    }, 900)
    return () => window.clearTimeout(timer)
    // 只在登录后的首个布局出现时触发一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  const navSections = [
    { label: '工作', items: NAV_MAIN },
    { label: '资料库', items: NAV_LIBRARY.filter((item) => !item.adminOnly || permissions.can_manage) },
    { label: '系统', items: NAV_SYSTEM.filter((item) => !item.adminOnly || permissions.can_manage) },
  ]

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex h-12 items-center px-4 pt-1">
        <TrafficLights />
      </div>

      <div className="px-3 pb-3 pt-1" data-tour="brand">
        <div className="flex items-center gap-2.5 rounded-xl px-1 py-1">
          <BrandMark />
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold tracking-tight">毛布选色 · 色研所</div>
            <div className="truncate text-[10.5px] text-muted-foreground">PlushColor Studio</div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-3">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/70">
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => (
                <NavItem key={item.to} item={item} onNavigate={() => setMobileOpen(false)} />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="space-y-1 border-t border-border/60 px-2 py-2">
        <AiStatus status={aiStatus} />
        <button
          type="button"
          data-tour="tour-button"
          onClick={startTour}
          className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[12px] font-medium text-muted-foreground transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <Compass className="h-4 w-4" strokeWidth={1.9} />
          新手指引
          <span className="ml-auto text-[10px] text-muted-foreground/60">
            {permissions.can_manage ? '8 步' : '7 步'}
          </span>
        </button>
      </div>
    </div>
  )

  return (
    <div className="flex h-full overflow-hidden bg-background">
      <aside className="hidden w-[232px] shrink-0 border-r border-border/60 glass-sidebar lg:block">{sidebar}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[268px] border-r border-border bg-sidebar shadow-mac-lg animate-slide-up">
            <button
              type="button"
              className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              onClick={() => setMobileOpen(false)}
              aria-label="关闭菜单"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebar}
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="toolbar sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-border/60 px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="打开菜单"
          >
            <Menu className="h-5 w-5" />
          </Button>

          <div className="min-w-0 flex-1">
            <div className="flex items-baseline gap-2.5">
              <h1 className="truncate text-[15px] font-semibold tracking-tight">{meta.title}</h1>
              <span className="hidden truncate text-[11.5px] text-muted-foreground sm:inline">{meta.hint}</span>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={startTour} aria-label="新手指引" data-tour="tour-header">
                  <Compass className="h-[17px] w-[17px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>新手指引</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={toggle} aria-label="切换深浅色" data-tour="theme-toggle">
                  {resolvedTheme === 'dark' ? <Sun className="h-[17px] w-[17px]" /> : <Moon className="h-[17px] w-[17px]" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{resolvedTheme === 'dark' ? '浅色模式' : '深色模式'}</TooltipContent>
            </Tooltip>

            <div className="mx-1 h-5 w-px bg-border" />

            {user ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    data-tour="user-menu"
                    className="flex items-center gap-2 rounded-full py-0.5 pl-0.5 pr-1.5 transition-colors hover:bg-muted/70"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] text-[11px] font-semibold text-white shadow-sm">
                      {initials(user.display_name || user.username)}
                    </span>
                    <span className="hidden max-w-[110px] truncate text-[12px] font-medium sm:block">
                      {user.display_name || user.username}
                    </span>
                    <ChevronDown className="hidden h-3 w-3 text-muted-foreground sm:block" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="normal-case tracking-normal">
                    <div className="flex items-center gap-2.5 py-1">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-[#0A84FF] to-[#5E5CE6] text-xs font-semibold text-white">
                        {initials(user.display_name || user.username)}
                      </span>
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-semibold normal-case text-foreground">
                          {user.display_name || user.username}
                        </div>
                        <div className="truncate text-[11px] font-normal text-muted-foreground">@{user.username}</div>
                      </div>
                      {permissions.can_manage && (
                        <Badge variant="default" className="ml-auto text-[10px]">
                          管理员
                        </Badge>
                      )}
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => navigate('/settings?tab=account')}>
                    <UserRound /> 账户设置
                  </DropdownMenuItem>
                  {permissions.can_manage && (
                    <DropdownMenuItem onSelect={() => navigate('/settings?tab=ai')}>
                      <Sparkles /> AI 设置
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem destructive onSelect={handleLogout}>
                    <LogOut /> 退出登录
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="soft"
                size="sm"
                className="h-8 gap-1.5 rounded-full px-3 text-[12px]"
                onClick={() => navigate('/login', { state: { from: `${location.pathname}${location.search}` } })}
              >
                <LogIn className="h-3.5 w-3.5" /> 登录
              </Button>
            )}
          </div>
        </header>

        <main className="relative flex flex-1 flex-col overflow-y-auto">
          <div className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 lg:px-8 lg:py-8">
            {!isFinder && <Outlet />}
            <div className={isFinder ? 'block' : 'hidden'} aria-hidden={!isFinder}>
              <FinderPage />
            </div>
          </div>
          <div className="mx-auto max-w-[1440px] px-4 pb-6 text-center text-[10.5px] text-muted-foreground/60 lg:px-8">
            色差受光线与屏幕影响，批量下单前请以实物色卡确认。
          </div>
        </main>
      </div>
    </div>
  )
}
