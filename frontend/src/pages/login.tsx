import * as React from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, Eye, EyeOff, Loader2, Moon, ShieldCheck, Sparkles, Sun, Wand2 } from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { useTheme } from '@/components/theme-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/sonner'
import { ApiError } from '@/lib/api'
import { BrandMark } from '@/components/brand'

export function LoginPage() {
  const { user, login } = useAuth()
  const { resolvedTheme, toggle } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [error, setError] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [showDemo, setShowDemo] = React.useState(false)

  const from = (location.state as { from?: string } | null)?.from || '/dashboard'

  if (user) return <Navigate to={from} replace />

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim() || !password) {
      setError('请输入用户名和密码')
      return
    }
    setLoading(true)
    setError('')
    try {
      const logged = await login(username.trim(), password)
      toast.success(`欢迎回来，${logged.display_name || logged.username}`)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '登录失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-[#F5F5F7] px-4 py-10 dark:bg-[#0E0E10]">
      <div
        className="pointer-events-none absolute inset-0 opacity-80"
        style={{
          background:
            'radial-gradient(60% 50% at 18% 12%, rgba(10,132,255,0.16), transparent 60%), radial-gradient(50% 45% at 85% 20%, rgba(255,159,10,0.12), transparent 60%), radial-gradient(55% 50% at 60% 100%, rgba(94,92,230,0.14), transparent 60%)',
        }}
      />

      <button
        type="button"
        onClick={toggle}
        className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full border border-border/70 bg-card/70 text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        aria-label="切换深浅色"
      >
        {resolvedTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <div className="relative z-10 grid w-full max-w-[960px] overflow-hidden rounded-[22px] border border-white/50 bg-card shadow-mac-lg dark:border-white/10 md:grid-cols-[1.02fr_1fr]">
        <div className="relative hidden min-h-[560px] flex-col justify-between overflow-hidden bg-[#141416] p-9 text-white md:flex">
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                'radial-gradient(90% 70% at 10% 0%, rgba(10,132,255,0.35), transparent 55%), radial-gradient(70% 60% at 100% 100%, rgba(255,159,10,0.28), transparent 60%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
              <BrandMark size="sm" />
              毛布选色 · 色研所
            </div>
            <div className="mt-14 max-w-[320px]">
              <div className="text-[28px] font-semibold leading-[1.22] tracking-[-0.03em]">
                把图片里的颜色，
                <br />
                变成可下单的毛布。
              </div>
              <p className="mt-4 text-[12.5px] leading-relaxed text-white/55">
                上传照片、用滴管取色，系统按 CIEDE2000 色差排序，再用 AI 解释每一个推荐。选色不再靠猜。
              </p>
            </div>
            <div className="mt-9 space-y-3.5 text-[12px] text-white/70">
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white/10">
                  <Wand2 className="h-3 w-3" />
                </span>
                图片滴管取色，HEX / Lab 一键换算
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white/10">
                  <Sparkles className="h-3 w-3" />
                </span>
                本地算法 + DeepSeek / Ollama 双通道
              </div>
              <div className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-white/10">
                  <ShieldCheck className="h-3 w-3" />
                </span>
                管理员可控的提示词与数据边界
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="flex h-14 overflow-hidden rounded-xl border border-white/10">
              {['#F3E9D2', '#D8C3A5', '#9FB0BF', '#7C8B6F', '#C97B63', '#6B5B73', '#1D1D1F'].map((color) => (
                <div key={color} className="flex-1" style={{ backgroundColor: color }} />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between text-[10px] text-white/40">
              <span>奶油白 · 燕麦 · 雾霾蓝 · 鼠尾草</span>
              <span>PLUSH PALETTE</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col justify-center p-7 sm:p-10">
          <div className="mb-6 flex items-center gap-2 md:hidden">
            <BrandMark />
            <div>
              <div className="text-[14px] font-semibold tracking-tight">毛布选色 · 色研所</div>
              <div className="text-[10.5px] text-muted-foreground">PlushColor Studio</div>
            </div>
          </div>

          <div className="space-y-1.5">
            <h1 className="text-[24px] font-semibold tracking-[-0.025em]">欢迎回来</h1>
            <p className="text-[12.5px] text-muted-foreground">登录后开始找色、管理商品与色号。</p>
          </div>

          <form className="mt-7 space-y-4" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="username">用户名</Label>
              <Input
                id="username"
                autoFocus
                autoComplete="username"
                placeholder="请输入用户名"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">密码</Label>
                <button
                  type="button"
                  onClick={() => setShowDemo((value) => !value)}
                  className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
                >
                  无法登录？
                </button>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label={showPassword ? '隐藏密码' : '显示密码'}
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {showDemo && (
              <div className="rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5 text-[11.5px] leading-relaxed text-muted-foreground animate-fade-in">
                请使用部署时设置的管理员账号。忘记密码时，让另一位管理员在「用户管理」中重置，或按部署手册重新初始化数据目录。
              </div>
            )}

            {error && (
              <div role="alert" className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-[12px] text-destructive animate-fade-in">
                {error}
              </div>
            )}

            <Button type="submit" className="group h-10 w-full text-[13px]" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {loading ? '登录中…' : '登录'}
              {!loading && <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />}
            </Button>
          </form>

          <p className="mt-7 text-[10.5px] leading-relaxed text-muted-foreground/70">
            登录即表示你同意仅将商品数据用于内部选色参考。购买链接归各店铺所有，价格与库存以淘宝页面为准。
          </p>
        </div>
      </div>
    </div>
  )
}
