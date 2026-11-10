import * as React from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ClipboardPaste,
  Download,
  FileJson,
  FileSpreadsheet,
  FileUp,
  Info,
  Loader2,
  RefreshCw,
  Sparkles,
  Store,
  UploadCloud,
  X,
} from 'lucide-react'

import { PageHeader, SectionTitle } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import type { ImportResult, TaobaoSyncStatus } from '@/lib/types'
import { cn, downloadText, formatPrice } from '@/lib/utils'

type ImportFormat = 'auto' | 'json' | 'csv'
type ImportMode = 'merge' | 'append'

const FORMATS: { value: ImportFormat; label: string }[] = [
  { value: 'auto', label: '自动识别' },
  { value: 'json', label: 'JSON' },
  { value: 'csv', label: 'CSV' },
]

const ACTION_LABEL: Record<string, string> = {
  create: '新增',
  update: '更新',
  skip: '跳过',
}

export function ImportPage() {
  const navigate = useNavigate()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [content, setContent] = React.useState('')
  const [filename, setFilename] = React.useState('')
  const [format, setFormat] = React.useState<ImportFormat>('auto')
  const [mode, setMode] = React.useState<ImportMode>('merge')
  const [preview, setPreview] = React.useState<ImportResult | null>(null)
  const [result, setResult] = React.useState<ImportResult | null>(null)
  const [busy, setBusy] = React.useState<'preview' | 'import' | 'template' | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const [templates, setTemplates] = React.useState<{ json: string; csv: string } | null>(null)
  const [sync, setSync] = React.useState<TaobaoSyncStatus | null>(null)
  const [syncBusy, setSyncBusy] = React.useState<'load' | 'import' | null>(null)

  const loadSync = async () => {
    setSyncBusy((current) => current || 'load')
    try {
      setSync(await api.products.taobaoSyncStatus())
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '无法读取淘宝同步状态')
    } finally {
      setSyncBusy(null)
    }
  }

  React.useEffect(() => {
    void loadSync()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const importSync = async () => {
    setSyncBusy('import')
    try {
      const response = await api.products.taobaoSyncImport()
      setResult(response)
      setPreview(null)
      toast.success('淘宝同步数据已导入', {
        description: `新增 ${response.created} 条、更新 ${response.updated} 条。`,
      })
      await loadSync()
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : '导入同步数据失败')
    } finally {
      setSyncBusy(null)
    }
  }

  const readFile = (file: File | null | undefined) => {
    if (!file) return
    if (file.size > 5 * 1024 * 1024) {
      toast.error('文件过大', { description: '导入文件不能超过 5MB，建议拆分后分批导入。' })
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setContent(String(reader.result || ''))
      setFilename(file.name)
      setPreview(null)
      setResult(null)
      if (/\.csv$/i.test(file.name)) setFormat('csv')
      else if (/\.json$/i.test(file.name)) setFormat('json')
      else setFormat('auto')
    }
    reader.onerror = () => toast.error('文件读取失败，请换一个文件试试')
    reader.readAsText(file, 'utf-8')
  }

  const run = async (dryRun: boolean) => {
    if (!content.trim()) {
      toast.error('还没有可导入的内容', { description: '拖入文件、选择文件，或直接粘贴 JSON / CSV 文本。' })
      return
    }
    setBusy(dryRun ? 'preview' : 'import')
    try {
      const response = await api.products.importProducts({
        content,
        format,
        mode,
        dry_run: dryRun,
      })
      if (dryRun) {
        setPreview(response)
        setResult(null)
        toast.success(`检查完成：${response.total_rows} 行数据`, {
          description: `预计新增 ${response.created} 条、更新 ${response.updated} 条${response.error_count ? `、${response.error_count} 行有问题` : ''}。`,
        })
      } else {
        setResult(response)
        setPreview(null)
        toast.success('导入完成', {
          description: `新增 ${response.created} 条，更新 ${response.updated} 条，跳过 ${response.skipped} 条。`,
        })
      }
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '导入失败，请稍后重试', {
        description: err instanceof ApiError && err.fields.length ? err.fields.map((item) => item.message).join('；') : undefined,
      })
    } finally {
      setBusy(null)
    }
  }

  const downloadTemplate = async (kind: 'json' | 'csv') => {
    setBusy('template')
    try {
      const data = templates || (await api.products.importTemplate())
      setTemplates(data)
      if (kind === 'json') downloadText('plushcolor-template.json', data.json, 'application/json')
      else downloadText('plushcolor-template.csv', data.csv, 'text/csv')
      toast.success(`已下载 ${kind.toUpperCase()} 模板`)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '模板下载失败')
    } finally {
      setBusy(null)
    }
  }

  const reset = () => {
    setContent('')
    setFilename('')
    setPreview(null)
    setResult(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  const rows = content.split(/\r?\n/).filter((line) => line.trim()).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="导入与导出"
        description="从 Excel、JSON 或采集脚本批量导入毛布商品。先预览再写入，不会弄乱已有数据。"
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate('/products')}>
            查看商品库
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <div className="card-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Store className="h-4 w-4 text-primary" />
              <span className="text-[13px] font-semibold">淘宝店铺同步</span>
              <Badge variant={sync?.available ? 'success' : 'muted'}>{sync?.available ? '可导入' : '未就绪'}</Badge>
            </div>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted-foreground">
              {sync?.available
                ? `同步文件包含 ${sync.count} 条商品，覆盖 ${sync.shops.length} 家店铺。导入不会删除已有商品，同款按 external_id 或标题+店铺更新。`
                : '同步文件还未生成。把采集器输出的 data/import/taobao-sync.json 放入项目后，点“刷新”即可导入。'}
            </p>
            {sync?.available && sync.shops.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {sync.shops.map((shop) => (
                  <span key={shop} className="rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    {shop}
                  </span>
                ))}
              </div>
            )}
            <div className="mt-2 rounded-lg bg-secondary/60 px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground">
              data/import/taobao-sync.json
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" disabled={!!syncBusy} onClick={() => void loadSync()}>
              {syncBusy === 'load' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              刷新
            </Button>
            <Button size="sm" disabled={!sync?.available || !!syncBusy} onClick={() => void importSync()}>
              {syncBusy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              导入同步数据
            </Button>
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_296px]">
        <div className="space-y-4">
          {/* Step 1 */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">1</span>
                <span className="text-[12.5px] font-medium">选择数据文件</span>
              </div>
              {filename && (
                <button type="button" onClick={reset} className="flex items-center gap-1 text-[10.5px] text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" /> 清空
                </button>
              )}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => inputRef.current?.click()}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
              }}
              onDragOver={(event) => {
                event.preventDefault()
                setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault()
                setDragging(false)
                readFile(event.dataTransfer.files?.[0])
              }}
              className={cn(
                'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-center transition-colors',
                dragging ? 'border-primary bg-primary/[0.06]' : 'border-border bg-muted/20 hover:border-foreground/25 hover:bg-muted/35',
              )}
            >
              <span className="grid h-10 w-10 place-items-center rounded-full bg-background shadow-sm ring-1 ring-border/60">
                <UploadCloud className="h-[18px] w-[18px] text-foreground/70" />
              </span>
              <div className="text-[12px]">
                {filename ? (
                  <>
                    已选择 <span className="font-medium text-foreground">{filename}</span>
                    <span className="text-muted-foreground"> · {rows} 行</span>
                  </>
                ) : (
                  <>
                    把 .json / .csv 文件拖到这里，或 <span className="font-medium text-primary">点击选择</span>
                  </>
                )}
              </div>
              <div className="text-[10.5px] text-muted-foreground">支持 UTF-8 编码，单文件不超过 5MB、2000 行</div>
            </div>
            <input
              ref={inputRef}
              type="file"
              accept=".json,.csv,.txt,application/json,text/csv"
              className="hidden"
              onChange={(event) => readFile(event.target.files?.[0])}
            />

            <div className="mt-3 flex items-center gap-2 text-[10px] text-muted-foreground">
              <ClipboardPaste className="h-3 w-3" />
              也可以把内容直接粘贴到下面，适合从表格里复制一小段先试一下。
            </div>
            <textarea
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                setPreview(null)
                setResult(null)
              }}
              spellCheck={false}
              placeholder={'[\n  {\n    "title": "奶油白法兰绒毛布",\n    "shop_name": "海鲜毛布",\n    "price": 39.9,\n    "colors": "奶油白:#F3E9D2|燕麦:#E4D5BF"\n  }\n]'}
              className="mt-2 h-[132px] w-full resize-y rounded-lg border border-border/70 bg-muted/10 p-3 font-mono text-[11px] leading-relaxed outline-none placeholder:text-muted-foreground/60 focus:border-foreground/20"
            />
          </div>

          {/* Step 2 */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">2</span>
              <span className="text-[12.5px] font-medium">检查导入设置</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">数据格式</div>
                <div className="flex rounded-lg border border-border/70 bg-muted/20 p-0.5">
                  {FORMATS.map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() => setFormat(item.value)}
                      className={cn(
                        'flex-1 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                        format === item.value ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-1.5 text-[10.5px] font-medium text-muted-foreground">重复数据怎么处理</div>
                <div className="flex rounded-lg border border-border/70 bg-muted/20 p-0.5">
                  <button
                    type="button"
                    onClick={() => setMode('merge')}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                      mode === 'merge' ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="按 external_id 或「标题 + 店铺」判断重复并更新"
                  >
                    更新已有
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('append')}
                    className={cn(
                      'flex-1 rounded-md px-2 py-1.5 text-[11px] transition-colors',
                      mode === 'append' ? 'bg-card font-medium text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
                    )}
                    title="始终新增，允许出现同名商品"
                  >
                    始终新增
                  </button>
                </div>
              </div>
            </div>
            <div className="mt-2.5 flex items-start gap-1.5 text-[10px] leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              「更新已有」适合重复导入同一批商品：有 external_id 时按它匹配，否则按标题 + 店铺匹配；「始终新增」会保留所有记录。
            </div>
          </div>

          {/* Step 3 */}
          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="grid h-5 w-5 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background">3</span>
                <span className="text-[12.5px] font-medium">先预览，再写入</span>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => run(true)}>
                  {busy === 'preview' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                  预览检查
                </Button>
                <Button size="sm" disabled={busy !== null || !content.trim()} onClick={() => run(false)}>
                  {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                  确认导入
                </Button>
              </div>
            </div>

            {busy === 'preview' && !preview && (
              <div className="space-y-2">
                <Skeleton className="h-9 rounded-lg" />
                <Skeleton className="h-9 rounded-lg" />
              </div>
            )}

            {preview && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { label: '数据行', value: preview.total_rows, tone: '' },
                    { label: '新增', value: preview.created, tone: 'text-emerald-600' },
                    { label: '更新', value: preview.updated, tone: 'text-blue-600' },
                    { label: '跳过', value: preview.skipped, tone: 'text-muted-foreground' },
                    { label: '问题行', value: preview.error_count, tone: preview.error_count ? 'text-rose-600' : 'text-muted-foreground' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
                      <div className="text-[9.5px] text-muted-foreground">{item.label}</div>
                      <div className={cn('mt-0.5 text-[16px] font-semibold tabular-nums', item.tone)}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <PreviewTable preview={preview} />

                {preview.error_count > 0 && (
                  <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] p-2.5">
                    <div className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-amber-700 dark:text-amber-400">
                      <AlertCircle className="h-3 w-3" /> 有 {preview.error_count} 行无法导入，其余行仍会正常写入
                    </div>
                    <ul className="max-h-[120px] space-y-0.5 overflow-auto text-[10.5px] text-muted-foreground">
                      {preview.errors.slice(0, 30).map((error, index) => (
                        <li key={`${error.row ?? error.index ?? index}-${error.message}`}>
                          第 {error.row ?? error.index ?? '?'} 行：{error.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 border-t border-border/60 pt-3">
                  <Button variant="ghost" size="sm" onClick={() => setPreview(null)}>
                    取消
                  </Button>
                  <Button size="sm" disabled={busy !== null} onClick={() => run(false)}>
                    {busy === 'import' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
                    确认写入 {preview.created + preview.updated} 条
                  </Button>
                </div>
              </div>
            )}

            {result && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <div className="text-[12px]">
                    导入完成：新增 <b>{result.created}</b> 条、更新 <b>{result.updated}</b> 条
                    {result.skipped ? `、跳过 ${result.skipped} 条` : ''}
                    {result.error_count ? `，另有 ${result.error_count} 行有问题` : ''}。
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => navigate('/products')}>
                    去商品库看看
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="outline" size="sm" onClick={reset}>
                    <RefreshCw className="h-3.5 w-3.5" /> 再导一批
                  </Button>
                </div>
                {result.error_count > 0 && (
                  <ul className="max-h-[140px] space-y-0.5 overflow-auto rounded-lg border border-border/60 bg-muted/20 p-2.5 text-[10.5px] text-muted-foreground">
                    {result.errors.slice(0, 40).map((error) => (
                      <li key={`${error.index}-${error.message}`}>
                        第 {error.index} 行：{error.message}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!preview && !result && busy !== 'preview' && (
              <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 bg-muted/10 py-6 text-center">
                <Sparkles className="h-4 w-4 text-muted-foreground/70" />
                <div className="text-[11.5px] text-muted-foreground">预览不会写入数据库，可以放心多试几次</div>
              </div>
            )}
          </div>
        </div>

        {/* Aside */}
        <aside className="space-y-4">
          <div className="card-surface p-4">
            <SectionTitle>下载模板</SectionTitle>
            <p className="mt-1 text-[10.5px] leading-relaxed text-muted-foreground">拿模板填好再导入最省事，字段说明见下方。</p>
            <div className="mt-2.5 grid gap-1.5">
              <Button variant="outline" size="sm" className="justify-start" disabled={busy !== null} onClick={() => downloadTemplate('json')}>
                <FileJson className="h-3.5 w-3.5" /> JSON 模板
              </Button>
              <Button variant="outline" size="sm" className="justify-start" disabled={busy !== null} onClick={() => downloadTemplate('csv')}>
                <FileSpreadsheet className="h-3.5 w-3.5" /> CSV 模板（Excel 可开）
              </Button>
              <a
                href={api.products.exportUrl('csv', {})}
                className="inline-flex h-8 items-center justify-start gap-2 rounded-lg border border-border/70 px-3 text-[12px] transition-colors hover:bg-accent"
              >
                <Download className="h-3.5 w-3.5" /> 导出全部商品
              </a>
            </div>
          </div>

          <div className="card-surface p-4">
            <SectionTitle>字段小抄</SectionTitle>
            <dl className="mt-2 space-y-1.5 text-[10.5px] leading-relaxed">
              {[
                ['title', '商品名称，必填'],
                ['shop_name', '店铺名，如「海鲜毛布」'],
                ['price', '价格，单位元；也支持 price_cents（分）'],
                ['colors', '「色名:HEX|色名:HEX」，第一个为主色'],
                ['material', '法兰绒 / 珊瑚绒 / 羊羔绒…'],
                ['status', 'active 在售、draft 草稿、archived 归档'],
                ['product_url', '淘宝商品链接，前台「去购买」用'],
              ].map(([key, text]) => (
                <div key={key} className="flex gap-2">
                  <dt className="w-[72px] shrink-0 font-mono text-[9.5px] text-foreground/80">{key}</dt>
                  <dd className="text-muted-foreground">{text}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 rounded-md bg-muted/40 px-2 py-1.5 font-mono text-[9.5px] text-muted-foreground">
              colors: 奶油白:#F3E9D2|燕麦:#E4D5BF
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-muted/20 p-3.5">
            <div className="flex items-center gap-1.5 text-[10.5px] font-medium">
              <Info className="h-3 w-3" /> 关于淘宝商品
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              淘宝需要登录后才能查看店铺商品，系统不内置免登录爬虫。当前商品库来自三家店铺的公开商品页，使用登录态采集后导入；你也可以用「后台导出 + 本页导入」。价格、库存与购买链接以淘宝实时页面为准。
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function formatPreviewColors(row: ImportResult['preview'][number]) {
  if (Array.isArray(row.colors)) {
    return row.colors.map((color) => `${color.name || '未命名'} ${color.hex}`).join(' · ') || '—'
  }
  return row.colors || row.hex || '—'
}

function PreviewTable({ preview }: { preview: ImportResult }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60">
      <table className="w-full text-left text-[10.5px]">
        <thead className="bg-muted/40 text-[9.5px] text-muted-foreground">
          <tr>
            <th className="px-2.5 py-1.5 font-medium">动作</th>
            <th className="px-2.5 py-1.5 font-medium">商品</th>
            <th className="px-2.5 py-1.5 font-medium">店铺</th>
            <th className="px-2.5 py-1.5 font-medium">色号</th>
            <th className="px-2.5 py-1.5 text-right font-medium">价格</th>
          </tr>
        </thead>
        <tbody>
          {preview.preview.map((row, index) => (
            <tr key={`${row.title}-${index}`} className="border-t border-border/50">
              <td className="px-2.5 py-1.5">
                <Badge variant={row.action === 'create' ? 'success' : row.action === 'update' ? 'default' : 'muted'} className="px-1.5 py-0 text-[9px]">
                  {ACTION_LABEL[row.action] || row.action}
                </Badge>
              </td>
              <td className="max-w-[220px] truncate px-2.5 py-1.5" title={row.title}>
                {row.title || '—'}
              </td>
              <td className="px-2.5 py-1.5 text-muted-foreground">{row.shop_name || '—'}</td>
              <td className="px-2.5 py-1.5 text-muted-foreground">
                <span className="line-clamp-1">{formatPreviewColors(row)}</span>
              </td>
              <td className="px-2.5 py-1.5 text-right tabular-nums">{row.price_cents != null ? formatPrice(row.price_cents) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!preview.preview.length && <div className="px-3 py-4 text-center text-[10.5px] text-muted-foreground">没有可预览的行</div>}
    </div>
  )
}
