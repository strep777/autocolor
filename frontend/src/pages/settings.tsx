import * as React from 'react'
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Database,
  Download,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  LockKeyhole,
  Monitor,
  Moon,
  Palette,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
  Sun,
  UserRound,
} from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { useTheme, type Theme } from '@/components/theme-provider'
import { ConfirmDialog, InfoRow, PageHeader, SectionTitle } from '@/components/common'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import type { AIConfig, AIStatus, AlertLogItem, OllamaModel } from '@/lib/types'
import { cn, formatDate, relativeTime } from '@/lib/utils'

type PromptKey = 'deepseek' | 'ollama' | 'analyze'

const PROMPT_META: { key: PromptKey; label: string; hint: string }[] = [
  { key: 'deepseek', label: 'DeepSeek 推荐', hint: '完整 SKILL 格式，强调硬性规则与 JSON 输出，适合 deepseek-flash-1017。' },
  { key: 'ollama', label: 'Ollama 推荐', hint: '精简版，只保留任务与 JSON 示例，适合 qwen2.5:3b 等本地小模型。' },
  { key: 'analyze', label: '色彩解读', hint: '非 JSON 输出，用于找色页的「AI 色彩解读」按钮。' },
]

function formatModelSize(bytes: number) {
  if (!bytes) return ''
  const gb = bytes / 1024 ** 3
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1024 ** 2))} MB`
}

export function SettingsPage() {
  const { permissions, refresh } = useAuth()
  const canManage = permissions.can_manage

  return (
    <div className="space-y-4">
      <PageHeader title="设置" description="管理 AI 服务、提示词、外观与账户安全。修改会立即影响整个工作台。" />

      <Tabs defaultValue={canManage ? 'ai' : 'account'} className="space-y-4">
        <TabsList>
          {canManage && (
            <TabsTrigger value="ai">
              <Bot className="mr-1.5 h-3.5 w-3.5" /> AI 助手
            </TabsTrigger>
          )}
          <TabsTrigger value="appearance">
            <Palette className="mr-1.5 h-3.5 w-3.5" /> 外观
          </TabsTrigger>
          <TabsTrigger value="account">
            <UserRound className="mr-1.5 h-3.5 w-3.5" /> 账户
          </TabsTrigger>
          {canManage && (
            <TabsTrigger value="data">
              <Database className="mr-1.5 h-3.5 w-3.5" /> 数据与安全
            </TabsTrigger>
          )}
        </TabsList>

        {canManage && (
          <TabsContent value="ai">
            <AiSettings />
          </TabsContent>
        )}
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="account">
          <AccountSettings onSaved={() => void refresh()} />
        </TabsContent>
        {canManage && (
          <TabsContent value="data">
            <DataSettings />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* AI                                                                  */
/* ------------------------------------------------------------------ */

function AiSettings() {
  const [config, setConfig] = React.useState<AIConfig | null>(null)
  const [status, setStatus] = React.useState<AIStatus | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [testing, setTesting] = React.useState<'deepseek' | 'ollama' | null>(null)
  const [testResult, setTestResult] = React.useState<{ ok: boolean; message?: string; reply?: string; elapsed_ms?: number; provider: string } | null>(null)
  const [showKey, setShowKey] = React.useState(false)
  const [promptTab, setPromptTab] = React.useState<PromptKey>('deepseek')

  const [form, setForm] = React.useState({
    enabled: true,
    provider: 'deepseek' as 'deepseek' | 'ollama',
    deepseek_base_url: '',
    deepseek_model: '',
    deepseek_api_key: '',
    ollama_base_url: '',
    ollama_model: '',
    temperature: 0.3,
    timeout_seconds: 40,
  })
  const [prompts, setPrompts] = React.useState<Record<PromptKey, string>>({ deepseek: '', ollama: '', analyze: '' })
  const [ollamaModels, setOllamaModels] = React.useState<OllamaModel[]>([])
  const [modelsLoading, setModelsLoading] = React.useState(false)
  const [modelsError, setModelsError] = React.useState('')
  const [modelsChecked, setModelsChecked] = React.useState(false)

  const refreshModels = React.useCallback(async (baseUrl: string) => {
    const base = baseUrl.trim()
    if (!base) {
      setModelsError('请先填写 Ollama 服务地址')
      setModelsChecked(true)
      return
    }
    setModelsLoading(true)
    try {
      const result = await api.ai.ollamaModels(base)
      setModelsChecked(true)
      setOllamaModels(result.models)
      if (!result.ok) {
        setOllamaModels([])
        setModelsError(result.message || '无法获取模型列表')
        return
      }
      if (!result.models.length) {
        setModelsError(result.message || 'Ollama 已连接，但还没有下载模型')
        return
      }
      setModelsError('')
      setForm((prev) => {
        const keep = prev.ollama_model && result.models.some((model) => model.name === prev.ollama_model)
        const next = keep ? prev.ollama_model : result.suggested || result.models[0].name
        return next === prev.ollama_model ? prev : { ...prev, ollama_model: next }
      })
    } catch (err) {
      setModelsChecked(true)
      setOllamaModels([])
      setModelsError(err instanceof ApiError ? err.message : '无法获取 Ollama 模型列表')
    } finally {
      setModelsLoading(false)
    }
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const [data, aiStatus] = await Promise.all([api.ai.config(), api.ai.status()])
      setConfig(data)
      setStatus(aiStatus)
      setForm({
        enabled: data.enabled,
        provider: data.provider,
        deepseek_base_url: data.deepseek_base_url,
        deepseek_model: data.deepseek_model,
        deepseek_api_key: data.deepseek_api_key,
        ollama_base_url: data.ollama_base_url,
        ollama_model: data.ollama_model,
        temperature: data.temperature,
        timeout_seconds: data.timeout_seconds,
      })
      setPrompts({ deepseek: data.prompt_deepseek, ollama: data.prompt_ollama, analyze: data.prompt_analyze })
      if (data.provider === 'ollama') void refreshModels(data.ollama_base_url)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'AI 配置加载失败')
    } finally {
      setLoading(false)
    }
  }, [refreshModels])

  React.useEffect(() => {
    load()
  }, [load])

  const payload = () => ({
    ...form,
    prompt_deepseek: prompts.deepseek,
    prompt_ollama: prompts.ollama,
    prompt_analyze: prompts.analyze,
  })

  const save = async (silent = false) => {
    if (form.provider === 'ollama' && !form.ollama_model.trim()) {
      toast.error('还没有选择 Ollama 模型', { description: '请先启动 Ollama 并下载模型，然后点击刷新按钮自动读取。' })
      return false
    }
    setSaving(true)
    try {
      const data = await api.ai.updateConfig(payload())
      setConfig(data)
      setForm((prev) => ({ ...prev, deepseek_api_key: data.deepseek_api_key }))
      setStatus(await api.ai.status())
      if (!silent) toast.success('AI 配置已保存')
      return true
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '保存失败，请检查填写内容')
      return false
    } finally {
      setSaving(false)
    }
  }

  const test = async (provider: 'deepseek' | 'ollama') => {
    setTesting(provider)
    setTestResult(null)
    try {
      const saved = await save(true)
      if (!saved) return
      const result = await api.ai.test(provider)
      setTestResult({ ...result, provider })
      if (result.ok) toast.success(`${provider === 'deepseek' ? 'DeepSeek' : 'Ollama'} 连接正常`, { description: result.elapsed_ms ? `耗时 ${result.elapsed_ms} ms` : undefined })
      else toast.error(result.message || '连接测试未通过')
      setStatus(await api.ai.status())
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '测试请求失败')
    } finally {
      setTesting(null)
    }
  }

  const fillDefault = async () => {
    try {
      const defaults = await api.ai.defaultPrompts()
      setPrompts((prev) => ({ ...prev, [promptTab]: defaults[promptTab] }))
      toast.success(`已填入默认${PROMPT_META.find((item) => item.key === promptTab)?.label}提示词`, { description: '确认无误后点击「保存配置」生效。' })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '默认提示词加载失败')
    }
  }

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Skeleton className="h-[420px] rounded-xl" />
        <Skeleton className="h-[300px] rounded-xl" />
      </div>
    )
  }

  const configured = status?.configured ?? false
  const selectedModel = ollamaModels.find((model) => model.name === form.ollama_model)

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
      <div className="space-y-4">
        <div className="card-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionTitle>AI 服务</SectionTitle>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                推荐默认走本地算法，开启 AI 后会让模型在本地候选里重新排序并解释理由。AI 失败会自动回退，不影响找色。
              </p>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
              aria-label="启用 AI"
            />
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setForm((prev) => ({ ...prev, provider: 'deepseek' }))}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                form.provider === 'deepseek' ? 'border-foreground/20 bg-muted/40' : 'border-border/70 hover:border-foreground/15',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] font-medium">
                  <Sparkles className="h-3.5 w-3.5" /> DeepSeek
                </span>
                {form.deepseek_api_key ? (
                  <Badge variant="success" className="px-1.5 py-0 text-[9px]">已配置密钥</Badge>
                ) : (
                  <Badge variant="muted" className="px-1.5 py-0 text-[9px]">未配置</Badge>
                )}
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">云端 · 默认 deepseek-chat，可换 deepseek-flash-1017</div>
            </button>
            <button
              type="button"
              onClick={() => {
                setForm((prev) => ({ ...prev, provider: 'ollama' }))
                if (!ollamaModels.length && !modelsLoading) void refreshModels(form.ollama_base_url)
              }}
              className={cn(
                'rounded-xl border p-3 text-left transition-colors',
                form.provider === 'ollama' ? 'border-foreground/20 bg-muted/40' : 'border-border/70 hover:border-foreground/15',
              )}
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[12px] font-medium">
                  <Bot className="h-3.5 w-3.5" /> Ollama
                </span>
                <Badge variant="muted" className="px-1.5 py-0 text-[9px]">本地</Badge>
              </div>
              <div className="mt-1 text-[10px] text-muted-foreground">本机或局域网 · 自动读取模型，默认优先 qwen2.5:3b</div>
            </button>
          </div>

          <div className="mt-4 space-y-3">
            <div className="rounded-xl border border-border/60 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium">
                <Sparkles className="h-3 w-3" /> DeepSeek
                <span className="ml-auto text-[9px] font-normal text-muted-foreground">OpenAI 兼容接口</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="API 地址" hint="一般不用改">
                  <Input
                    value={form.deepseek_base_url}
                    onChange={(event) => setForm((prev) => ({ ...prev, deepseek_base_url: event.target.value }))}
                    placeholder="https://api.deepseek.com"
                    className="h-8 font-mono text-[11px]"
                  />
                </Field>
                <Field label="模型">
                  <Input
                    value={form.deepseek_model}
                    onChange={(event) => setForm((prev) => ({ ...prev, deepseek_model: event.target.value }))}
                    placeholder="deepseek-chat"
                    className="h-8 font-mono text-[11px]"
                  />
                </Field>
              </div>
              <div className="mt-2.5">
                <Field label="API Key" hint="保存在服务端，加密存储；留空表示不修改">
                  <div className="relative">
                    <Input
                      type={showKey ? 'text' : 'password'}
                      value={form.deepseek_api_key}
                      onChange={(event) => setForm((prev) => ({ ...prev, deepseek_api_key: event.target.value }))}
                      placeholder="sk-…"
                      autoComplete="off"
                      className="h-8 pr-8 font-mono text-[11px]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((prev) => !prev)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                      aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                    >
                      {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    </button>
                  </div>
                </Field>
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={testing !== null || saving} onClick={() => test('deepseek')}>
                  {testing === 'deepseek' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  保存并测试
                </Button>
                <span className="text-[9.5px] text-muted-foreground">
                  {config?.deepseek_configured ? `已保存密钥 ${config.deepseek_api_key}` : '还没有保存密钥'}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-border/60 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium">
                <Bot className="h-3 w-3" /> Ollama
                <span className="ml-auto text-[9px] font-normal text-muted-foreground">本地 11434 端口</span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                <Field label="服务地址" hint="Docker 部署填 host.docker.internal">
                  <Input
                    value={form.ollama_base_url}
                    onChange={(event) => setForm((prev) => ({ ...prev, ollama_base_url: event.target.value }))}
                    onBlur={() => form.provider === 'ollama' && refreshModels(form.ollama_base_url)}
                    placeholder="http://localhost:11434"
                    className="h-8 font-mono text-[11px]"
                  />
                </Field>
                <Field label="模型" hint="自动读取本机已下载模型">
                  <div className="flex items-center gap-1.5">
                    <Select
                      value={form.ollama_model || undefined}
                      onValueChange={(value) => setForm((prev) => ({ ...prev, ollama_model: value }))}
                      disabled={modelsLoading || !ollamaModels.length}
                    >
                      <SelectTrigger className="h-8 min-w-0 flex-1 font-mono text-[11px]">
                        <SelectValue placeholder={modelsLoading ? '正在检测…' : '未检测到模型'} />
                      </SelectTrigger>
                      <SelectContent>
                        {ollamaModels.map((model) => (
                          <SelectItem key={model.name} value={model.name}>
                            <span className="font-mono">{model.name}</span>
                            {model.size > 0 && <span className="ml-2 text-[10px] text-muted-foreground">{formatModelSize(model.size)}</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      className="h-8 w-8 shrink-0"
                      disabled={modelsLoading}
                      onClick={() => refreshModels(form.ollama_base_url)}
                      title="重新读取 Ollama 模型"
                    >
                      <RefreshCw className={cn('h-3.5 w-3.5', modelsLoading && 'animate-spin')} />
                    </Button>
                  </div>
                </Field>
              </div>
              <div className="mt-2 flex items-start gap-1.5 text-[9.5px] leading-relaxed">
                {modelsLoading ? (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> 正在连接 Ollama 读取模型…
                  </span>
                ) : modelsError ? (
                  <span className="flex items-start gap-1 text-rose-600 dark:text-rose-400">
                    <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {modelsError}
                      <button type="button" className="ml-1 underline underline-offset-2" onClick={() => refreshModels(form.ollama_base_url)}>
                        重试
                      </button>
                    </span>
                  </span>
                ) : ollamaModels.length ? (
                  <span className="flex items-start gap-1 text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      已读取 {ollamaModels.length} 个本机模型
                      {selectedModel?.parameter_size ? ` · ${selectedModel.parameter_size}` : ''}
                      {selectedModel?.quantization_level ? ` · ${selectedModel.quantization_level}` : ''}
                    </span>
                  </span>
                ) : modelsChecked ? (
                  <span className="text-muted-foreground">
                    没有检测到模型，先在终端运行 <code className="rounded bg-muted px-1 py-0.5 font-mono">ollama pull qwen2.5:3b</code>
                  </span>
                ) : (
                  <span className="text-muted-foreground">启动 Ollama 后会自动读取模型，无需手工填写名称。</span>
                )}
              </div>
              <div className="mt-2.5 flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={testing !== null || saving} onClick={() => test('ollama')}>
                  {testing === 'ollama' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                  保存并测试
                </Button>
                <span className="text-[9.5px] text-muted-foreground">需要本机先运行 ollama serve</span>
              </div>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2">
              <Field label="温度" hint="0 更稳定，1 更有想象力">
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.1}
                    value={form.temperature}
                    onChange={(event) => setForm((prev) => ({ ...prev, temperature: Number(event.target.value) }))}
                    className="h-1.5 flex-1 accent-[#0A84FF]"
                  />
                  <span className="w-7 text-right font-mono text-[11px] tabular-nums">{form.temperature.toFixed(1)}</span>
                </div>
              </Field>
              <Field label="超时（秒）" hint="本地模型可适当加大">
                <Input
                  type="number"
                  min={5}
                  max={180}
                  value={form.timeout_seconds}
                  onChange={(event) => setForm((prev) => ({ ...prev, timeout_seconds: Number(event.target.value) }))}
                  className="h-8 w-24 text-[11px]"
                />
              </Field>
            </div>
          </div>

          {testResult && (
            <div
              className={cn(
                'mt-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-[10.5px]',
                testResult.ok ? 'border-emerald-500/25 bg-emerald-500/[0.06] text-emerald-700 dark:text-emerald-400' : 'border-rose-500/25 bg-rose-500/[0.06] text-rose-700 dark:text-rose-400',
              )}
            >
              {testResult.ok ? <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" /> : <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />}
              <div className="min-w-0">
                <div className="font-medium">
                  {testResult.provider === 'deepseek' ? 'DeepSeek' : 'Ollama'} · {testResult.ok ? '连接成功' : '连接失败'}
                  {testResult.elapsed_ms ? `（${testResult.elapsed_ms} ms）` : ''}
                </div>
                <div className="mt-0.5 break-words opacity-90">{testResult.ok ? testResult.reply || '模型已返回响应。' : testResult.message}</div>
              </div>
            </div>
          )}
        </div>

        <div className="card-surface p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SectionTitle>默认提示词（Skill）</SectionTitle>
              <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">
                用类似 skill 的格式约束模型行为：只输出约定 JSON、不给候选之外的商品、不改变分数语义。三个提示词独立保存。
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={fillDefault}>
              <RotateCcw className="h-3.5 w-3.5" /> 填入默认
            </Button>
          </div>

          <div className="mt-3 flex gap-1 border-b border-border/60">
            {PROMPT_META.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setPromptTab(item.key)}
                className={cn(
                  'relative -mb-px border-b-2 px-3 py-2 text-[11px] transition-colors',
                  promptTab === item.key ? 'border-foreground font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">{PROMPT_META.find((item) => item.key === promptTab)?.hint}</p>
          <textarea
            value={prompts[promptTab]}
            onChange={(event) => setPrompts((prev) => ({ ...prev, [promptTab]: event.target.value }))}
            spellCheck={false}
            className="mt-2 h-[320px] w-full resize-y rounded-lg border border-border/70 bg-muted/10 p-3 font-mono text-[10.5px] leading-relaxed outline-none focus:border-foreground/20"
          />
          <div className="mt-1 flex items-center justify-between text-[9.5px] text-muted-foreground">
            <span>提示词会拼在候选 JSON 之前发送给模型；修改后点保存生效。</span>
            <span className="tabular-nums">{prompts[promptTab].length} 字符</span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={saving}>
            <RefreshCw className="h-3.5 w-3.5" /> 重新载入
          </Button>
          <Button size="sm" onClick={() => void save()} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            保存配置
          </Button>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card-surface p-4">
          <SectionTitle>当前状态</SectionTitle>
          <div className="mt-2 space-y-2.5">
            <InfoRow label="AI 功能" value={status?.enabled ? '已开启' : '已关闭'} />
            <InfoRow label="默认提供商" value={status?.provider === 'ollama' ? 'Ollama（本地）' : 'DeepSeek（云端）'} />
            <InfoRow
              label="当前模型"
              value={<span className="font-mono text-[10.5px]">{form.provider === 'ollama' ? form.ollama_model || '—' : status?.model || '—'}</span>}
            />
            <InfoRow
              label="可用性"
              value={configured ? <span className="text-emerald-600">已就绪</span> : <span className="text-amber-600">待配置密钥</span>}
            />
          </div>
          <div className="mt-3 rounded-lg bg-muted/40 px-2.5 py-2 text-[9.5px] leading-relaxed text-muted-foreground">
            AI 只做「重排 + 解释」，ΔE 与分数由本地 CIEDE2000 计算，模型无法凭空创造商品。失败时自动回退本地结果。
          </div>
        </div>

        <div className="card-surface p-4">
          <SectionTitle>怎么选</SectionTitle>
          <ul className="mt-2 space-y-2 text-[10px] leading-relaxed text-muted-foreground">
            <li>· 日常用 DeepSeek，速度快、解释自然。</li>
            <li>· 断网或注重隐私时切 Ollama，首次调用需加载模型，会慢一些。</li>
            <li>· 小模型（qwen2.5:3b）用精简提示词，别塞太长规则。</li>
            <li>· 换模型后点「保存并测试」，通过再让前台使用。</li>
          </ul>
        </div>

        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium">
            <LockKeyhole className="h-3 w-3" /> 密钥安全
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            API Key 只在服务端解密使用，浏览器拿到的是掩码；日志与报错不会包含完整密钥。请定期轮换。
          </p>
        </div>
      </aside>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10.5px] font-medium text-foreground/80">{label}</span>
        {hint && <span className="truncate text-[9px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Appearance                                                          */
/* ------------------------------------------------------------------ */

function AppearanceSettings() {
  const { theme, resolvedTheme, setTheme } = useTheme()
  const options: { value: Theme; label: string; description: string; icon: React.ElementType }[] = [
    { value: 'light', label: '浅色', description: '像纸张一样干净', icon: Sun },
    { value: 'dark', label: '深色', description: '夜里看更舒服', icon: Moon },
    { value: 'system', label: '跟随系统', description: '随系统自动切换', icon: Monitor },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
      <div className="card-surface p-4">
        <SectionTitle>主题外观</SectionTitle>
        <p className="mt-1 text-[10.5px] text-muted-foreground">选择只影响当前浏览器，保存在本机，不会改动其他人的界面。</p>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {options.map((option) => {
            const Icon = option.icon
            const active = theme === option.value
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setTheme(option.value)}
                className={cn(
                  'rounded-xl border p-3 text-left transition-colors',
                  active ? 'border-foreground/25 bg-muted/40 ring-1 ring-foreground/10' : 'border-border/70 hover:border-foreground/15',
                )}
              >
                <div className="flex items-center justify-between">
                  <Icon className="h-4 w-4" />
                  {active && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="mt-2 text-[12px] font-medium">{option.label}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{option.description}</div>
              </button>
            )
          })}
        </div>
        <div className="mt-3 rounded-lg bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
          当前生效：{resolvedTheme === 'dark' ? '深色' : '浅色'} · 界面使用 macOS 风格的毛玻璃、圆角与留白，表格在窄屏会自动横向滚动。
        </div>
      </div>

      <div className="card-surface p-4">
        <SectionTitle>界面预览</SectionTitle>
        <div className="mt-2 overflow-hidden rounded-xl border border-border/60">
          <div className="flex h-6 items-center gap-1 border-b border-border/50 bg-muted/60 px-2">
            <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
            <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
            <span className="h-2 w-2 rounded-full bg-[#28C840]" />
            <span className="ml-2 text-[8px] text-muted-foreground">色研所</span>
          </div>
          <div className="flex">
            <div className="w-16 space-y-1 border-r border-border/50 bg-muted/30 p-2">
              <div className="h-1.5 w-10 rounded bg-foreground/25" />
              <div className="h-1.5 w-9 rounded bg-foreground/10" />
              <div className="h-1.5 w-11 rounded bg-foreground/10" />
            </div>
            <div className="flex-1 space-y-1.5 p-2.5">
              <div className="h-2 w-20 rounded bg-foreground/20" />
              <div className="grid grid-cols-3 gap-1">
                <div className="h-8 rounded bg-[#E9DDC7]" />
                <div className="h-8 rounded bg-[#9FB0BF]" />
                <div className="h-8 rounded bg-[#7C8B6F]" />
              </div>
              <div className="h-1.5 w-full rounded bg-foreground/10" />
            </div>
          </div>
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">颜色只是工具，最后仍以实物打样为准。</p>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Account                                                             */
/* ------------------------------------------------------------------ */

function AccountSettings({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth()
  const [current, setCurrent] = React.useState('')
  const [next, setNext] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [busy, setBusy] = React.useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (next.length < 6) {
      toast.error('新密码至少 6 位')
      return
    }
    if (next !== confirm) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setBusy(true)
    try {
      const result = await api.auth.changePassword(current, next)
      toast.success('密码已更新', { description: result.message })
      setCurrent('')
      setNext('')
      setConfirm('')
      onSaved()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '密码修改失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
      <div className="space-y-4">
        <div className="card-surface p-4">
          <SectionTitle>账户信息</SectionTitle>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            <InfoBox label="用户名" value={user?.username || '—'} />
            <InfoBox label="显示名称" value={user?.display_name || user?.username || '—'} />
            <InfoBox label="角色" value={user?.role === 'admin' ? '管理员' : '普通用户'} />
            <InfoBox label="上次登录" value={user?.last_login_at ? formatDate(user.last_login_at, true) : '—'} />
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">如需修改显示名称或角色，请联系管理员在「用户管理」中调整。</p>
        </div>

        <form onSubmit={submit} className="card-surface p-4">
          <SectionTitle>修改密码</SectionTitle>
          <p className="mt-1 text-[10.5px] text-muted-foreground">建议使用 8 位以上、包含字母与数字的密码。修改后其他设备会退出登录。</p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            <Field label="当前密码">
              <Input type="password" value={current} onChange={(event) => setCurrent(event.target.value)} autoComplete="current-password" className="h-8 text-[11px]" />
            </Field>
            <Field label="新密码">
              <Input type="password" value={next} onChange={(event) => setNext(event.target.value)} autoComplete="new-password" className="h-8 text-[11px]" />
            </Field>
            <Field label="确认新密码">
              <Input type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" className="h-8 text-[11px]" />
            </Field>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="submit" size="sm" disabled={busy || !current || !next || !confirm}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
              更新密码
            </Button>
          </div>
        </form>
      </div>

      <aside className="space-y-4">
        <div className="card-surface p-4">
          <SectionTitle>登录安全</SectionTitle>
          <div className="mt-2 space-y-2.5">
            <InfoRow label="会话时长" value="7 天" />
            <InfoRow label="登录保护" value="5 次失败后限时" />
            <InfoRow label="Cookie" value="HttpOnly · SameSite" />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5 text-[10px] leading-relaxed text-muted-foreground">
          <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
            <LockKeyhole className="h-3 w-3" /> 小提示
          </div>
          忘记密码时，请让另一位管理员在用户管理中重置；系统里至少保留一名启用状态的管理员。
        </div>
      </aside>
    </div>
  )
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
      <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-[11.5px] font-medium">{value}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Data & audit                                                        */
/* ------------------------------------------------------------------ */

function DataSettings() {
  const [logs, setLogs] = React.useState<AlertLogItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirmReset, setConfirmReset] = React.useState(false)
  const [confirmPrompts, setConfirmPrompts] = React.useState(false)

  const loadLogs = React.useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.settings.audit()
      setLogs(data.items)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '审计日志加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadLogs()
  }, [loadLogs])

  const resetDemo = async () => {
    setBusy('demo')
    try {
      const result = await api.settings.resetDemo()
      toast.success('示例数据处理完成', { description: result.message })
      setConfirmReset(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  const restorePrompts = async () => {
    setBusy('prompts')
    try {
      const result = await api.settings.restorePrompts()
      toast.success(result.message)
      setConfirmPrompts(false)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '操作失败')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_292px]">
      <div className="space-y-4">
        <div className="card-surface p-4">
          <SectionTitle>数据维护</SectionTitle>
          <p className="mt-1 text-[10.5px] text-muted-foreground">这些操作会影响整个工作台，执行前请确认。</p>
          <div className="mt-3 space-y-2">
            <ActionRow
              icon={Download}
              title="导出全部商品"
              description="CSV 含色号、价格与购买链接，可用 Excel 打开或留作备份。"
              action={
                <a href={api.products.exportUrl('csv', {})}>
                  <Button variant="outline" size="sm">导出 CSV</Button>
                </a>
              }
            />
            <ActionRow
              icon={RotateCcw}
              title="恢复默认提示词"
              description="把 DeepSeek / Ollama / 色彩解读提示词还原为出厂版本。"
              action={
                <Button variant="outline" size="sm" onClick={() => setConfirmPrompts(true)}>
                  恢复默认
                </Button>
              }
            />
            <ActionRow
              icon={Database}
              title="清理演示数据"
              description="删除 source=demo 的演示商品与示例图片，保留淘宝真实商品和你自己导入的数据。"
              action={
                <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-600" onClick={() => setConfirmReset(true)}>
                  清理演示
                </Button>
              }
            />
          </div>
        </div>

        <div className="card-surface p-4">
          <div className="flex items-center justify-between">
            <div>
              <SectionTitle>安全审计</SectionTitle>
              <p className="mt-1 text-[10.5px] text-muted-foreground">最近 50 条登录、增删改与设置变更记录。</p>
            </div>
            <Button variant="ghost" size="sm" onClick={loadLogs} disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} /> 刷新
            </Button>
          </div>

          <div className="mt-3 max-h-[420px] overflow-auto rounded-lg border border-border/60">
            {loading ? (
              <div className="space-y-1.5 p-2">
                {Array.from({ length: 6 }).map((_, index) => (
                  <Skeleton key={index} className="h-8 rounded-md" />
                ))}
              </div>
            ) : !logs.length ? (
              <div className="px-3 py-8 text-center text-[10.5px] text-muted-foreground">还没有审计记录</div>
            ) : (
              <table className="w-full text-left text-[10.5px]">
                <thead className="sticky top-0 bg-muted/70 text-[9px] text-muted-foreground backdrop-blur">
                  <tr>
                    <th className="px-2.5 py-1.5 font-medium">时间</th>
                    <th className="px-2.5 py-1.5 font-medium">动作</th>
                    <th className="px-2.5 py-1.5 font-medium">对象</th>
                    <th className="px-2.5 py-1.5 font-medium">详情</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-t border-border/50">
                      <td className="whitespace-nowrap px-2.5 py-1.5 text-muted-foreground" title={log.created_at || ''}>
                        {relativeTime(log.created_at)}
                      </td>
                      <td className="px-2.5 py-1.5 font-mono text-[9.5px]">{log.action}</td>
                      <td className="px-2.5 py-1.5 text-muted-foreground">
                        {log.target_type}
                        {log.target_id ? ` #${log.target_id}` : ''}
                      </td>
                      <td className="max-w-[240px] truncate px-2.5 py-1.5 text-muted-foreground" title={log.detail}>
                        {log.detail || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4">
        <div className="card-surface p-4">
          <SectionTitle>部署信息</SectionTitle>
          <div className="mt-2 space-y-2.5">
            <InfoRow label="产品" value="毛布选色 · 色研所" />
            <InfoRow label="数据存储" value="SQLite · 单文件" />
            <InfoRow label="上传目录" value="data/uploads" />
            <InfoRow label="备份建议" value="每周复制 data/" />
          </div>
        </div>
        <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
          <div className="flex items-center gap-1.5 text-[10.5px] font-medium">
            <ShieldCheck className="h-3 w-3" /> 备份怎么做
          </div>
          <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            停止容器后复制整个 <code className="rounded bg-muted px-1">data/</code> 目录即可，包含数据库、上传图片与会话密钥。恢复时原样放回。
          </p>
        </div>
      </aside>

      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="清理演示商品？"
        description="只会删除 source=demo 的商品及其色号与示例图片；淘宝真实商品和你手动导入的内容不受影响。此操作不可撤销。"
        confirmLabel="清理演示数据"
        destructive
        loading={busy === 'demo'}
        onConfirm={resetDemo}
      />
      <ConfirmDialog
        open={confirmPrompts}
        onOpenChange={setConfirmPrompts}
        title="恢复默认提示词？"
        description="三个提示词都会还原为内置版本，你自定义的内容会被覆盖。建议先把满意的提示词复制备份。"
        confirmLabel="恢复默认"
        destructive
        loading={busy === 'prompts'}
        onConfirm={restorePrompts}
      />
    </div>
  )
}

function ActionRow({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: React.ElementType
  title: string
  description: string
  action: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 px-3 py-2.5">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-muted/50">
        <Icon className="h-3.5 w-3.5 text-foreground/70" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11.5px] font-medium">{title}</div>
        <div className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">{description}</div>
      </div>
      {action}
    </div>
  )
}
