import * as React from 'react'
import {
  KeyRound,
  Loader2,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserPlus,
  UserRound,
  Users,
} from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { ConfirmDialog, EmptyState, PageHeader, Pagination } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import type { Paged, Role, User } from '@/lib/types'
import { cn, formatDate, initials, relativeTime } from '@/lib/utils'

const PAGE_SIZE = 20

export function UsersPage() {
  const { user: me, permissions, refresh } = useAuth()
  const [data, setData] = React.useState<Paged<User> | null>(null)
  const [query, setQuery] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [loading, setLoading] = React.useState(true)
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<User | null>(null)
  const [resetting, setResetting] = React.useState<User | null>(null)
  const [deleting, setDeleting] = React.useState<User | null>(null)
  const [deleteBusy, setDeleteBusy] = React.useState(false)

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.users.list(query, page, PAGE_SIZE)
      setData(response)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '用户列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [query, page])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    const timer = window.setTimeout(() => setPage(1), 260)
    return () => window.clearTimeout(timer)
  }, [query])

  const remove = async () => {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await api.users.remove(deleting.id)
      toast.success(`已删除用户 ${deleting.display_name || deleting.username}`)
      setDeleting(null)
      if (data && data.items.length === 1 && page > 1) setPage(page - 1)
      else load()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setDeleteBusy(false)
    }
  }

  const adminCount = data?.items.filter((item) => item.role === 'admin' && item.is_active).length ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        title="用户管理"
        description={
          permissions.can_manage
            ? `共 ${data?.total ?? '—'} 位成员。管理员可以管理商品、导入与 AI 配置；普通用户只能浏览与找色。`
            : '查看工作台成员。'
        }
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <UserPlus className="h-3.5 w-3.5" /> 添加成员
          </Button>
        }
      />

      <div className="card-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-border/60 p-3">
          <div className="relative min-w-[170px] flex-1 sm:max-w-[280px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索用户名或显示名称…"
              className="h-8 pl-8 text-[12px]"
            />
          </div>
          <div className="ml-auto flex items-center gap-2 text-[10.5px] text-muted-foreground">
            {adminCount > 0 && (
              <span className="hidden items-center gap-1 sm:flex">
                <ShieldCheck className="h-3 w-3" /> 共 {adminCount} 位管理员
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
              刷新
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="text-[10px] text-muted-foreground">
              <tr className="border-b border-border/60">
                <th className="px-4 py-2 font-medium">成员</th>
                <th className="px-3 py-2 font-medium">角色</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">最近登录</th>
                <th className="px-3 py-2 font-medium">创建时间</th>
                <th className="px-4 py-2 text-right font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 5 }).map((_, index) => (
                  <tr key={index} className="border-b border-border/40">
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-8 rounded-md" />
                    </td>
                  </tr>
                ))
              ) : !data?.items.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10">
                    <EmptyState
                      icon={Users}
                      title={query ? '没有找到匹配的成员' : '还没有其他成员'}
                      description={query ? '换个关键词试试。' : '添加成员后，他们就能登录工作台浏览商品与找色。'}
                      action={
                        !query ? (
                          <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
                            <UserPlus className="h-3.5 w-3.5" /> 添加第一位成员
                          </Button>
                        ) : undefined
                      }
                    />
                  </td>
                </tr>
              ) : (
                data.items.map((item) => {
                  const isSelf = item.id === me?.id
                  return (
                    <tr key={item.id} className="border-b border-border/40 transition-colors hover:bg-muted/25">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-[10.5px] font-semibold text-foreground/70">
                            {initials(item.display_name || item.username)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-[12px] font-medium">{item.display_name || item.username}</span>
                              {isSelf && <Badge variant="muted" className="px-1 py-0 text-[8.5px]">你</Badge>}
                            </div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">@{item.username}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5">
                        <Badge variant={item.role === 'admin' ? 'default' : 'muted'} className="gap-1 px-1.5 py-0 text-[9.5px]">
                          {item.role === 'admin' ? <ShieldCheck className="h-2.5 w-2.5" /> : <UserRound className="h-2.5 w-2.5" />}
                          {item.role === 'admin' ? '管理员' : '普通用户'}
                        </Badge>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="flex items-center gap-1.5 text-[10.5px]">
                          <span className={cn('h-1.5 w-1.5 rounded-full', item.is_active ? 'bg-emerald-500' : 'bg-muted-foreground/40')} />
                          {item.is_active ? '启用' : '停用'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[10.5px] text-muted-foreground" title={item.last_login_at ? formatDate(item.last_login_at, true) : ''}>
                        {item.last_login_at ? relativeTime(item.last_login_at) : '从未登录'}
                      </td>
                      <td className="px-3 py-2.5 text-[10.5px] text-muted-foreground">{formatDate(item.created_at)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon-sm" aria-label="成员操作">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-[160px]">
                            <DropdownMenuItem onClick={() => setEditing(item)}>
                              <Pencil className="h-3.5 w-3.5" /> 编辑资料
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setResetting(item)}>
                              <KeyRound className="h-3.5 w-3.5" /> 重置密码
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              disabled={isSelf}
                              className="text-rose-600 focus:text-rose-600"
                              onClick={() => setDeleting(item)}
                            >
                              <Trash2 className="h-3.5 w-3.5" /> 删除成员
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.total > PAGE_SIZE && (
          <div className="px-3 pb-3">
            <Pagination page={page} pages={data.pages} total={data.total} pageSize={PAGE_SIZE} onChange={setPage} />
          </div>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-muted/20 px-3.5 py-2.5 text-[10px] leading-relaxed text-muted-foreground">
        安全规则：不能停用或删除自己；系统始终保留至少一名启用状态的管理员；重置密码后该成员的所有登录会话会立即失效。
      </div>

      <CreateUserDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={() => {
          setPage(1)
          load()
        }}
      />

      <EditUserDialog
        user={editing}
        isSelf={editing?.id === me?.id}
        onClose={() => setEditing(null)}
        onSaved={() => {
          load()
          void refresh()
        }}
      />

      <ResetPasswordDialog user={resetting} onClose={() => setResetting(null)} />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`删除成员「${deleting?.display_name || deleting?.username || ''}」？`}
        description="该成员的登录账号会被永久删除，历史审计记录会保留但不再关联到用户。此操作不可撤销。"
        confirmLabel="删除成员"
        destructive
        loading={deleteBusy}
        onConfirm={remove}
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */

function RoleSelect({ value, onChange, disabled }: { value: Role; onChange: (value: Role) => void; disabled?: boolean }) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as Role)} disabled={disabled}>
      <SelectTrigger className="h-8 text-[11.5px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="admin">管理员 · 可管理全部数据</SelectItem>
        <SelectItem value="user">普通用户 · 浏览与找色</SelectItem>
      </SelectContent>
    </Select>
  )
}

function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: () => void }) {
  const [username, setUsername] = React.useState('')
  const [displayName, setDisplayName] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [role, setRole] = React.useState<Role>('user')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setUsername('')
      setDisplayName('')
      setPassword('')
      setRole('user')
      setError('')
    }
  }, [open])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (username.trim().length < 2) {
      setError('用户名至少 2 个字符')
      return
    }
    if (!/^[A-Za-z0-9_\-\u4e00-\u9fa5]+$/.test(username.trim())) {
      setError('用户名只能包含中文、字母、数字、下划线和短横线')
      return
    }
    if (password.length < 6) {
      setError('密码至少 6 位')
      return
    }
    setBusy(true)
    try {
      await api.users.create({ username: username.trim(), password, display_name: displayName.trim(), role })
      toast.success('成员已添加', { description: `${displayName.trim() || username.trim()} 现在可以登录了。` })
      onOpenChange(false)
      onCreated()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '添加失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>添加成员</DialogTitle>
          <DialogDescription>新成员会立即生效，无需邮箱验证。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10.5px] font-medium">用户名 *</div>
              <Input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="如 xiaolin" autoFocus className="h-8 text-[12px]" />
            </div>
            <div>
              <div className="mb-1 text-[10.5px] font-medium">显示名称</div>
              <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="如 小林" className="h-8 text-[12px]" />
            </div>
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-medium">初始密码 *</div>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" autoComplete="new-password" className="h-8 text-[12px]" />
            <div className="mt-1 text-[9.5px] text-muted-foreground">请通过安全方式告知成员，并提醒其首次登录后修改。</div>
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-medium">角色</div>
            <RoleSelect value={role} onChange={setRole} />
          </div>
          {error && <div className="rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[10.5px] text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
              添加成员
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EditUserDialog({
  user,
  isSelf,
  onClose,
  onSaved,
}: {
  user: User | null
  isSelf: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [displayName, setDisplayName] = React.useState('')
  const [role, setRole] = React.useState<Role>('user')
  const [active, setActive] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (user) {
      setDisplayName(user.display_name || '')
      setRole(user.role)
      setActive(user.is_active)
      setError('')
    }
  }, [user])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    setBusy(true)
    setError('')
    try {
      await api.users.update(user.id, {
        display_name: displayName.trim(),
        role: isSelf ? undefined : role,
        is_active: isSelf ? undefined : active,
      })
      toast.success('成员资料已更新')
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '保存失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader>
          <DialogTitle>编辑成员</DialogTitle>
          <DialogDescription>@{user?.username} · 创建于 {formatDate(user?.created_at)}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="mb-1 text-[10.5px] font-medium">显示名称</div>
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder={user?.username} className="h-8 text-[12px]" />
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-medium">角色</div>
            <RoleSelect value={role} onChange={setRole} disabled={isSelf} />
            {isSelf && <div className="mt-1 text-[9.5px] text-muted-foreground">不能修改自己的角色，避免误操作后无人可管理。</div>}
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
            <div>
              <div className="text-[11.5px] font-medium">启用账号</div>
              <div className="mt-0.5 text-[9.5px] text-muted-foreground">停用后该成员会立即被登出，无法登录。</div>
            </div>
            <Switch checked={active} disabled={isSelf} onCheckedChange={setActive} aria-label="启用账号" />
          </div>
          {error && <div className="rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[10.5px] text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pencil className="h-3.5 w-3.5" />}
              保存修改
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ResetPasswordDialog({ user, onClose }: { user: User | null; onClose: () => void }) {
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (user) {
      setPassword('')
      setConfirm('')
      setError('')
    }
  }, [user])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!user) return
    if (password.length < 6) {
      setError('新密码至少 6 位')
      return
    }
    if (password !== confirm) {
      setError('两次输入的密码不一致')
      return
    }
    setBusy(true)
    setError('')
    try {
      const result = await api.users.resetPassword(user.id, password)
      toast.success('密码已重置', { description: result.message })
      onClose()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '重置失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={!!user} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>重置密码</DialogTitle>
          <DialogDescription>为 {user?.display_name || user?.username} 设置新密码，保存后其所有会话会失效。</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <div className="mb-1 text-[10.5px] font-medium">新密码</div>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" autoComplete="new-password" className="h-8 text-[12px]" />
          </div>
          <div>
            <div className="mb-1 text-[10.5px] font-medium">确认新密码</div>
            <Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className="h-8 text-[12px]" />
          </div>
          {error && <div className="rounded-md bg-rose-500/10 px-2.5 py-1.5 text-[10.5px] text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
              重置密码
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
