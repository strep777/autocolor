import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowUpRight,
  Check,
  Clipboard,
  Copy,
  ImagePlus,
  Loader2,
  Pencil,
  Pipette,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Upload,
  Wand2,
  X,
} from 'lucide-react'

import { PageHeader, ColorDot } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import { contrastText, normalizeHex, rgbToHex, rgbToHsl } from '@/lib/colors'
import type { AIStatus, RecommendItem, RecommendMode, RecommendResult } from '@/lib/types'
import { cn, copyText, formatPrice } from '@/lib/utils'

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
const ZOOM = 11

type SavedColorTab = {
  id: string
  hex: string
  name: string
  result: RecommendResult | null
  loading: boolean
  error: string
}

function makeTabId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

const PRESET_COLORS: { hex: string; name: string }[] = [
  { hex: '#F3E9D2', name: '奶油白' },
  { hex: '#E4D5BF', name: '燕麦' },
  { hex: '#C9B79C', name: '驼色' },
  { hex: '#9FB0BF', name: '雾霾蓝' },
  { hex: '#7C8B6F', name: '鼠尾草' },
  { hex: '#C97B63', name: '陶土' },
  { hex: '#8E7CC3', name: '香芋紫' },
  { hex: '#6B5B73', name: '灰紫' },
  { hex: '#3D4A44', name: '墨绿' },
  { hex: '#1D1D1F', name: '炭黑' },
]

function isValidHex(value: string): boolean {
  return !!normalizeHex(value)
}

function LevelBadge({ level }: { level: RecommendItem['level'] }) {
  const map = {
    close: { label: '很接近', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
    similar: { label: '相近', className: 'bg-primary/10 text-primary' },
    inspiration: { label: '可参考', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  }[level]
  return <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-medium', map.className)}>{map.label}</span>
}

function ValueCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">{label}</div>
      <div className="truncate font-mono text-[11px] font-medium">{value}</div>
    </div>
  )
}

function Magnifier({
  imageSrc,
  width,
  height,
  x,
  y,
  hex,
  clientX,
  clientY,
}: {
  imageSrc: string
  width: number
  height: number
  x: number
  y: number
  hex: string
  clientX: number
  clientY: number
}) {
  const size = 104
  const left = Math.min(clientX + 18, window.innerWidth - size - 16)
  const top = Math.min(clientY + 18, window.innerHeight - size - 54)
  return (
    <div className="pointer-events-none fixed z-50 overflow-hidden rounded-xl border border-white/20 bg-[#141416] p-1.5 shadow-2xl" style={{ left, top }}>
      <div
        className="relative"
        style={{
          width: size - 12,
          height: size - 12,
          backgroundImage: `url(${imageSrc})`,
          backgroundSize: `${width * ZOOM}px ${height * ZOOM}px`,
          backgroundPosition: `${(size - 12) / 2 - (x + 0.5) * ZOOM}px ${(size - 12) / 2 - (y + 0.5) * ZOOM}px`,
          imageRendering: 'pixelated',
        }}
      >
        <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-white/70 mix-blend-difference" />
        <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-white/70 mix-blend-difference" />
        <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/90 mix-blend-difference" />
      </div>
      <div className="mt-1 flex items-center justify-between px-1 pb-0.5">
        <span className="font-mono text-[10px] text-white/80">{hex}</span>
        <span className="text-[9px] text-white/40">5×5 均值</span>
      </div>
    </div>
  )
}

export function FinderPage() {
  const [searchParams] = useSearchParams()
  const initialHex = normalizeHex(searchParams.get('hex') || '') || ''

  const [hex, setHex] = React.useState(initialHex)
  const [hexInput, setHexInput] = React.useState(initialHex)
  const [mode, setMode] = React.useState<RecommendMode>('local')
  const [onlyClose, setOnlyClose] = React.useState(false)
  const [result, setResult] = React.useState<RecommendResult | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState('')
  const [tabs, setTabs] = React.useState<SavedColorTab[]>([])
  const [activeTabId, setActiveTabId] = React.useState<string | null>(null)
  const [selectedTabs, setSelectedTabs] = React.useState<Set<string>>(new Set())
  const [renameOpen, setRenameOpen] = React.useState(false)
  const [renameValue, setRenameValue] = React.useState('')
  const [aiStatus, setAiStatus] = React.useState<AIStatus | null>(null)
  const [feedback, setFeedback] = React.useState<Record<number, 1 | -1>>({})

  const [imageSrc, setImageSrc] = React.useState<string | null>(null)
  const [imageSize, setImageSize] = React.useState({ width: 0, height: 0 })
  const [dragging, setDragging] = React.useState(false)
  const [hover, setHover] = React.useState<{ x: number; y: number; hex: string; clientX: number; clientY: number } | null>(
    null,
  )
  const [analyzeOpen, setAnalyzeOpen] = React.useState(false)
  const [analyzeText, setAnalyzeText] = React.useState('')
  const [analyzeLoading, setAnalyzeLoading] = React.useState(false)
  const [analyzeError, setAnalyzeError] = React.useState('')

  const canvasRef = React.useRef<HTMLCanvasElement | null>(null)
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const modeRef = React.useRef<RecommendMode>('local')
  const requestRef = React.useRef(0)
  const tabsRef = React.useRef<SavedColorTab[]>([])
  const activeIdRef = React.useRef<string | null>(null)
  const skipRecommendRef = React.useRef(false)
  const imageInputRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    tabsRef.current = tabs
  }, [tabs])

  React.useEffect(() => {
    activeIdRef.current = activeTabId
  }, [activeTabId])

  React.useEffect(() => {
    modeRef.current = mode
  }, [mode])

  React.useEffect(() => {
    let alive = true
    api.ai
      .status()
      .then((status) => {
        if (alive) setAiStatus(status)
      })
      .catch(() => {
        if (alive) setAiStatus(null)
      })
    return () => {
      alive = false
    }
  }, [])

  const runRecommend = React.useCallback(
    async (value: string, requestedMode: RecommendMode, closeOnly: boolean, tabId: string | null) => {
      const seq = ++requestRef.current
      setLoading(true)
      setError('')
      if (tabId) {
        setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, loading: true, error: '' } : tab)))
      }
      try {
        const response = await api.recommend.create({
          hex: value,
          mode: requestedMode,
          limit: 8,
          only_close: closeOnly,
        })
        if (seq !== requestRef.current) return
        if (!tabId || activeIdRef.current === tabId) setResult(response)
        if (tabId) {
          setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, result: response, loading: false, error: '' } : tab)))
        }
        if (response.mode === 'local_fallback' && response.ai_error) {
          toast.warning('AI 调用失败，已自动回退本地排序', { description: response.ai_error })
        }
      } catch (err) {
        if (seq !== requestRef.current) return
        const message = err instanceof ApiError ? err.message : '匹配失败，请稍后重试'
        if (!tabId || activeIdRef.current === tabId) {
          setResult(null)
          setError(message)
        }
        if (tabId) {
          setTabs((prev) => prev.map((tab) => (tab.id === tabId ? { ...tab, result: null, loading: false, error: message } : tab)))
        }
      } finally {
        if (seq === requestRef.current) setLoading(false)
      }
    },
    [],
  )

  React.useEffect(() => {
    if (!hex || !activeTabId) return
    if (skipRecommendRef.current) {
      skipRecommendRef.current = false
      return
    }
    runRecommend(hex, modeRef.current, onlyClose, activeTabId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex, onlyClose, activeTabId])

  const activateTab = React.useCallback((tab: SavedColorTab) => {
    activeIdRef.current = tab.id
    setActiveTabId(tab.id)
    setHex(tab.hex)
    setHexInput(tab.hex)
    setResult(tab.result)
    setError(tab.error)
    setLoading(tab.loading)
    skipRecommendRef.current = !!tab.result
  }, [])

  const applyHex = React.useCallback((value: string, name = '手动取色') => {
    const normalized = normalizeHex(value)
    if (!normalized) {
      toast.error('色值格式不正确', { description: '请输入 #RRGGBB，例如 #C9B79C' })
      return
    }
    const existing = tabsRef.current.find((tab) => tab.hex === normalized)
    if (existing) {
      activateTab(existing)
      return
    }
    const tab: SavedColorTab = {
      id: makeTabId(),
      hex: normalized,
      name: name || normalized,
      result: null,
      loading: false,
      error: '',
    }
    activeIdRef.current = tab.id
    setTabs((prev) => [...prev, tab])
    setActiveTabId(tab.id)
    setSelectedTabs(new Set())
    setResult(null)
    setError('')
    setLoading(false)
    setHex(normalized)
    setHexInput(normalized)
  }, [activateTab])

  React.useEffect(() => {
    if (!initialHex) return
    applyHex(initialHex, '链接颜色')
  }, [applyHex, initialHex])

  const toggleTabSelection = (id: string) => {
    setSelectedTabs((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allTabsSelected = tabs.length > 0 && selectedTabs.size === tabs.length

  const toggleSelectAllTabs = () => {
    setSelectedTabs(allTabsSelected ? new Set() : new Set(tabs.map((tab) => tab.id)))
  }

  const removeTabs = (ids: Set<string>) => {
    if (!ids.size) return
    const next = tabs.filter((tab) => !ids.has(tab.id))
    const removingActive = !!activeTabId && ids.has(activeTabId)
    setTabs(next)
    setSelectedTabs((prev) => {
      const updated = new Set(prev)
      ids.forEach((id) => updated.delete(id))
      return updated
    })
    if (removingActive) {
      const fallback = next[next.length - 1]
      if (fallback) {
        activateTab(fallback)
      } else {
        activeIdRef.current = null
        setActiveTabId(null)
        setHex('')
        setHexInput('')
        setResult(null)
        setError('')
        setLoading(false)
      }
    }
  }

  const renameActiveTab = () => {
    const name = renameValue.trim()
    if (!name || !activeTabId) return
    setTabs((prev) => prev.map((tab) => (tab.id === activeTabId ? { ...tab, name } : tab)))
    setRenameOpen(false)
  }

  const drawToCanvas = React.useCallback((source: CanvasImageSource, width: number, height: number) => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return false
    const scale = Math.min(1, 3000 / width, 3000 / height)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return false
    context.drawImage(source, 0, 0, canvas.width, canvas.height)
    setImageSize({ width: canvas.width, height: canvas.height })
    setImageSrc(canvas.toDataURL('image/jpeg', 0.86))
    return true
  }, [])

  const loadFile = React.useCallback(
    async (file: File | null | undefined) => {
      if (!file) return
      const nameLooksImage = /\.(jpe?g|png|webp)$/i.test(file.name || '')
      if (!ACCEPTED.includes(file.type) && !(nameLooksImage && !file.type)) {
        toast.error('请选择 JPG / PNG / WebP 图片')
        return
      }
      setHover(null)
      try {
        // 大图先让浏览器在解码阶段降采样，避免超大原图直接铺满画布内存。
        if (file.size > 6 * 1024 * 1024 && typeof createImageBitmap === 'function') {
          try {
            const bitmap = await createImageBitmap(file, { resizeWidth: 2400, resizeQuality: 'high' })
            const drawn = drawToCanvas(bitmap, bitmap.width, bitmap.height)
            bitmap.close()
            if (drawn) return
          } catch {
            // 某些浏览器不支持 resize 选项，回退到 FileReader + Image 解码。
          }
        }
        const reader = new FileReader()
        reader.onload = () => {
          const image = new Image()
          image.onload = () => {
            if (!drawToCanvas(image, image.naturalWidth, image.naturalHeight)) {
              toast.error('图片尺寸异常，无法建立取色画布')
            }
          }
          image.onerror = () => toast.error('图片解码失败，请换一张试试')
          image.src = String(reader.result)
        }
        reader.onerror = () => toast.error('图片读取失败，请换一张试试')
        reader.readAsDataURL(file)
      } catch {
        toast.error('图片读取失败；超大图片建议先导出为 JPG 再试')
      }
    },
    [drawToCanvas],
  )

  React.useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (file) {
        event.preventDefault()
        loadFile(file)
        toast.success('已从剪贴板读取图片')
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [loadFile])

  const pixelAt = React.useCallback((clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas || !canvas.width) return null
    const rect = canvas.getBoundingClientRect()
    const x = Math.floor(((clientX - rect.left) / rect.width) * canvas.width)
    const y = Math.floor(((clientY - rect.top) / rect.height) * canvas.height)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return null
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) return null
    // 取点击点周围 5×5 像素的平均色，降低照片噪点与屏幕摩尔纹的影响
    const startX = Math.max(0, x - 2)
    const startY = Math.max(0, y - 2)
    const sampleWidth = Math.min(5, canvas.width - startX)
    const sampleHeight = Math.min(5, canvas.height - startY)
    const data = context.getImageData(startX, startY, sampleWidth, sampleHeight).data
    let red = 0
    let green = 0
    let blue = 0
    let count = 0
    for (let index = 0; index < data.length; index += 4) {
      if (data[index + 3] === 0) continue
      red += data[index]
      green += data[index + 1]
      blue += data[index + 2]
      count += 1
    }
    if (!count) return null
    return {
      x,
      y,
      hex: rgbToHex({ r: Math.round(red / count), g: Math.round(green / count), b: Math.round(blue / count) }),
      clientX,
      clientY,
    }
  }, [])

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pixel = pixelAt(event.clientX, event.clientY)
    setHover(pixel)
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const pixel = pixelAt(event.clientX, event.clientY)
    if (!pixel) return
    applyHex(pixel.hex, '画布取色')
    setHover(pixel)
  }

  const switchMode = (next: RecommendMode) => {
    if (next === mode) return
    if (next === 'ai' && !aiStatus?.configured) {
      toast.error('AI 尚未配置', { description: '请让管理员在「设置 → AI」填写 API Key 或模型地址。' })
      return
    }
    modeRef.current = next
    setMode(next)
    if (!hex || !activeTabId) return
    setTabs((prev) => prev.map((tab) => ({ ...tab, result: null, error: '' })))
    setResult(null)
    setError('')
    runRecommend(hex, next, onlyClose, activeTabId)
  }

  const copy = async (text: string, label = '已复制') => {
    const ok = await copyText(text)
    if (ok) toast.success(label, { description: text })
    else toast.error('复制失败，请手动选择文本')
  }

  const openAnalyze = async () => {
    if (!hex) return
    if (!aiStatus?.configured) {
      toast.error('AI 尚未配置', { description: '请让管理员在设置中填写 AI API。' })
      return
    }
    setAnalyzeOpen(true)
    if (analyzeText) return
    setAnalyzeLoading(true)
    setAnalyzeError('')
    try {
      const response = await api.ai.analyze({ hex })
      setAnalyzeText(response.text)
    } catch (err) {
      setAnalyzeError(err instanceof ApiError ? err.message : 'AI 分析失败，请稍后重试')
    } finally {
      setAnalyzeLoading(false)
    }
  }

  const sendFeedback = async (logId: number, value: 1 | -1) => {
    try {
      await api.recommend.feedback(logId, value)
      setFeedback((current) => ({ ...current, [logId]: value }))
      toast.success(value === 1 ? '已记录：这次推荐有帮助' : '已记录：我们会继续优化')
    } catch {
      toast.error('反馈提交失败')
    }
  }

  const target = result?.target
  const rgb = target ? { r: target.rgb.r, g: target.rgb.g, b: target.rgb.b } : null
  const hsl = rgb ? rgbToHsl(rgb) : null
  const aiReady = Boolean(aiStatus?.enabled && aiStatus?.configured)

  return (
    <div className="space-y-5">
      <PageHeader
        title="找色匹配"
        description="从图片里吸取一个颜色，按 CIEDE2000 色差找到最接近的毛布；AI 只负责解释与重排，结果始终可回退。"
        actions={
          <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-card p-1 text-[11.5px]">
            <button
              type="button"
              onClick={() => switchMode('local')}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
                mode === 'local' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Pipette className="h-3.5 w-3.5" />
              本地算法
            </button>
            <button
              type="button"
              onClick={() => switchMode('ai')}
              disabled={!aiReady}
              title={aiReady ? undefined : 'AI 尚未配置，请先到设置中启用'}
              className={cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                mode === 'ai' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              AI 精排
            </button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.06fr)] xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="card-surface overflow-hidden">
            <div className="flex items-center justify-between border-b border-border/60 px-4 py-2.5">
              <div className="flex items-center gap-2 text-[12px] font-medium">
                <ImagePlus className="h-3.5 w-3.5 text-muted-foreground" />
                取色画布
              </div>
              {imageSrc && (
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={() => imageInputRef.current?.click()}>
                    更换图片
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px] text-muted-foreground"
                    onClick={() => {
                      setImageSrc(null)
                      setHover(null)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                    移除
                  </Button>
                </div>
              )}
            </div>

            {!imageSrc && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') fileRef.current?.click()
                }}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragging(false)
                  loadFile(event.dataTransfer.files?.[0])
                }}
                className={cn(
                  'm-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition-colors',
                  dragging ? 'border-primary bg-primary/5' : 'border-border/80 bg-muted/20 hover:border-primary/40 hover:bg-primary/[0.03]',
                )}
              >
                <div className="mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-card shadow-sm">
                  <Upload className="h-5 w-5 text-primary" strokeWidth={1.7} />
                </div>
                <div className="text-[13px] font-medium">拖入图片，或点击选择</div>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  支持 JPG / PNG / WebP，不限大小
                  <br />
                  也可以直接按 Ctrl / ⌘ + V 粘贴截图
                </p>
              </div>
            )}

            {/* canvas 必须始终挂载：首次选图前它也要能接收像素，否则第一张图永远画不出来 */}
            <div
              className={cn(
                'relative flex max-h-[460px] items-center justify-center overflow-hidden bg-[#0E0E10]/95 p-3',
                !imageSrc && 'hidden',
              )}
            >
              <canvas
                ref={canvasRef}
                onPointerMove={handlePointerMove}
                onPointerLeave={() => setHover(null)}
                onPointerDown={handlePointerDown}
                className="max-h-[430px] max-w-full cursor-crosshair rounded-md object-contain touch-none"
                style={{ width: 'auto', height: 'auto' }}
              />
              <div className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-[10px] text-white/70 backdrop-blur">
                <Pipette className="h-3 w-3" />
                移动查看放大镜 · 单击吸取颜色
              </div>
            </div>

            <input
              ref={imageInputRef}
              type="file"
              accept={ACCEPTED.join(',')}
              className="hidden"
              onChange={(event) => loadFile(event.target.files?.[0])}
            />
            <input ref={fileRef} type="file" accept={ACCEPTED.join(',')} className="hidden" onChange={(event) => loadFile(event.target.files?.[0])} />

            <div className="border-t border-border/60 px-4 py-3">
              <div className="mb-2 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                <Wand2 className="h-3 w-3" />
                没有图片？也可以直接输入色值，或从常用色里挑一个
              </div>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Input
                    value={hexInput}
                    onChange={(event) => setHexInput(event.target.value.toUpperCase())}
                    onBlur={() => hexInput && applyHex(hexInput)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') applyHex(hexInput)
                    }}
                    placeholder="#C9B79C"
                    className="h-9 pl-7 font-mono text-[12px] uppercase"
                    maxLength={7}
                  />
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground/60">#</span>
                </div>
                <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-md border border-border/70">
                  <input
                    type="color"
                    value={isValidHex(hex) ? hex : '#C9B79C'}
                    onChange={(event) => applyHex(event.target.value, '取色器')}
                    className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer border-0 bg-transparent p-0"
                    aria-label="打开系统取色器"
                  />
                </div>
                <Button variant="outline" size="sm" className="h-9 shrink-0" onClick={() => applyHex(hexInput)}>
                  取色
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {PRESET_COLORS.map((preset) => (
                  <button
                    key={preset.hex}
                    type="button"
                    title={`${preset.name} ${preset.hex}`}
                    onClick={() => applyHex(preset.hex, preset.name)}
                    className={cn(
                      'h-6 w-6 rounded-full ring-1 ring-inset ring-black/10 transition-transform hover:scale-110',
                      hex === preset.hex && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                    )}
                    style={{ backgroundColor: preset.hex }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="card-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[12px] font-semibold">目标颜色</div>
              {hex && (
                <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" onClick={openAnalyze}>
                  <Sparkles className="h-3 w-3" />
                  AI 色彩解读
                </Button>
              )}
            </div>

            {!hex ? (
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-border/70 px-3 py-4 text-[11.5px] text-muted-foreground">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-muted/60">
                  <Pipette className="h-4 w-4" />
                </span>
                在图片上单击，或输入一个 HEX，这里会显示 Lab 与色系。
              </div>
            ) : (
              <div className="flex gap-4">
                <div
                  className="flex h-[104px] w-[104px] shrink-0 flex-col justify-between rounded-xl p-2.5 ring-1 ring-inset ring-black/10"
                  style={{ backgroundColor: hex, color: contrastText(hex) }}
                >
                  <span className="text-[10px] opacity-70">PLUSH COLOR</span>
                  <div>
                    <div className="font-mono text-[11px] font-semibold tracking-wide">{hex}</div>
                    <button type="button" className="mt-1 flex items-center gap-1 text-[9.5px] opacity-75 hover:opacity-100" onClick={() => copy(hex)}>
                      <Copy className="h-2.5 w-2.5" /> 复制
                    </button>
                  </div>
                </div>
                <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-2.5">
                  <ValueCell label="RGB" value={rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '—'} />
                  <ValueCell label="HSL" value={hsl ? `${hsl.h}°, ${hsl.s}%, ${hsl.l}%` : '—'} />
                  <ValueCell label="Lab L" value={target ? target.lab.l.toFixed(1) : '计算中…'} />
                  <ValueCell label="Lab a/b" value={target ? `${target.lab.a.toFixed(1)} / ${target.lab.b.toFixed(1)}` : '计算中…'} />
                  <div className="col-span-2 flex items-center gap-1.5">
                    <span className="text-[9.5px] uppercase tracking-wide text-muted-foreground/70">色系</span>
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10.5px] font-medium">{target?.family || '识别中'}</span>
                    <button type="button" onClick={() => copy(hex, '色值已复制')} className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
                      <Clipboard className="h-3 w-3" /> 复制色值
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="card-surface p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-[12px] font-semibold">已选颜色</div>
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{tabs.length}</span>
              <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
                <Checkbox checked={allTabsSelected} onCheckedChange={toggleSelectAllTabs} className="h-3.5 w-3.5" />
                全选
              </label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px]"
                disabled={!activeTabId}
                onClick={() => {
                  const active = tabs.find((tab) => tab.id === activeTabId)
                  setRenameValue(active?.name || '')
                  setRenameOpen(true)
                }}
              >
                <Pencil className="h-3 w-3" />
                重命名
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={selectedTabs.size === 0}
                onClick={() => removeTabs(selectedTabs)}
              >
                <Trash2 className="h-3 w-3" />
                删除{selectedTabs.size > 0 ? ` ${selectedTabs.size}` : ''}
              </Button>
            </div>
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {tabs.length === 0 && (
                <div className="rounded-lg border border-dashed border-border/70 px-3 py-2 text-[10.5px] text-muted-foreground">
                  点击图片、输入 HEX 或选择常用色，会自动保存为一个颜色标签。
                </div>
              )}
              {tabs.map((tab) => (
                <div
                  key={tab.id}
                  className={cn(
                    'group flex shrink-0 items-center gap-1 rounded-lg border px-1.5 py-1 transition-colors',
                    tab.id === activeTabId ? 'border-primary/40 bg-primary/[0.06]' : 'border-border/70 bg-card hover:bg-muted/40',
                  )}
                >
                  <Checkbox
                    checked={selectedTabs.has(tab.id)}
                    onCheckedChange={() => toggleTabSelection(tab.id)}
                    className="h-3.5 w-3.5"
                    aria-label={`选择 ${tab.name}`}
                  />
                  <button type="button" onClick={() => activateTab(tab)} className="flex items-center gap-1.5 text-left">
                    <span className="h-3.5 w-3.5 rounded-full ring-1 ring-inset ring-black/10" style={{ backgroundColor: tab.hex }} />
                    <span className="max-w-[9rem] truncate text-[11px] font-medium">{tab.name}</span>
                    <span className="font-mono text-[9.5px] text-muted-foreground">{tab.hex}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => removeTabs(new Set([tab.id]))}
                    className="rounded p-0.5 text-muted-foreground/60 opacity-0 transition-opacity hover:bg-muted hover:text-foreground group-hover:opacity-100"
                    aria-label={`删除 ${tab.name}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="card-surface flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div>
              <div className="text-[13px] font-semibold">匹配结果</div>
              <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                {result
                  ? `${result.items.length} 个候选 · 覆盖 ${new Set(result.items.map((item) => item.shop_name)).size} 家 · ${result.elapsed_ms}ms · ${
                      result.mode === 'ai' ? `AI 精排（${result.provider}）` : result.mode === 'local_fallback' ? '本地回退' : '本地算法'
                    }`
                  : '选择颜色后自动匹配'}
              </div>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-muted-foreground">
              <Switch checked={onlyClose} onCheckedChange={setOnlyClose} />
              只看很接近（ΔE ≤ 3.5）
            </label>
          </div>

          {result?.mode === 'local_fallback' && result.ai_error && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-2.5 text-[11.5px] leading-relaxed text-amber-700 dark:text-amber-300">
              AI 暂时不可用，已自动回退本地排序。原因：{result.ai_error}
            </div>
          )}

          {result?.summary && (
            <div className="rounded-xl border border-primary/15 bg-primary/[0.04] p-4">
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                <Sparkles className="h-3.5 w-3.5" />
                {result.mode === 'ai'
                  ? `AI 选色建议 · ${result.provider}`
                  : result.mode === 'local_fallback'
                    ? '本地算法建议（AI 已回退）'
                    : '本地算法建议'}
              </div>
              <p className="text-[12px] leading-relaxed text-foreground/85">{result.summary}</p>
              {result.advice && <p className="mt-2 text-[11.5px] leading-relaxed text-muted-foreground">搭配建议：{result.advice}</p>}
              {result.caution && <p className="mt-1.5 text-[11px] leading-relaxed text-amber-600 dark:text-amber-400">注意：{result.caution}</p>}
            </div>
          )}

          {error && (
            <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] px-4 py-3 text-[12px] text-destructive">{error}</div>
          )}

          {loading && !result && (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-[118px] rounded-xl" />
              ))}
            </div>
          )}

          {!hex && !loading && (
            <div className="card-surface flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-primary/10">
                <Pipette className="h-6 w-6 text-primary" strokeWidth={1.6} />
              </div>
              <div className="text-[14px] font-medium">先选一个颜色</div>
              <p className="mt-1.5 max-w-[280px] text-[11.5px] leading-relaxed text-muted-foreground">
                上传图片后用滴管点击，或直接输入 HEX。系统会按色差从近到远列出可购买的毛布。
              </p>
              <div className="mt-5 grid w-full max-w-[300px] grid-cols-3 gap-2 text-left text-[10px] text-muted-foreground">
                {[
                  { step: '1', text: '上传 / 粘贴图片' },
                  { step: '2', text: '滴管吸取颜色' },
                  { step: '3', text: '查看匹配与购买' },
                ].map((item) => (
                  <div key={item.step} className="rounded-lg border border-border/60 bg-muted/20 px-2.5 py-2">
                    <span className="font-mono text-[9px] text-primary">{item.step}</span>
                    <div className="mt-1 leading-snug">{item.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && result && result.items.length === 0 && (
            <div className="card-surface flex flex-col items-center justify-center px-6 py-14 text-center">
              <div className="text-[14px] font-medium">这个范围内没有匹配的毛布</div>
              <p className="mt-1.5 max-w-[280px] text-[11.5px] leading-relaxed text-muted-foreground">
                {onlyClose ? '试试关闭「只看很接近」，色差稍大的颜色也可能符合整体感觉。' : '商品库可能还没有登记相近色号，先导入更多商品或换一个颜色。'}
              </p>
              {onlyClose && (
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setOnlyClose(false)}>
                  查看全部相近色
                </Button>
              )}
            </div>
          )}

          {result && result.items.length > 0 && (
            <div className={cn('space-y-3 transition-opacity', loading && 'pointer-events-none opacity-50')}>
              {loading && (
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> 正在重新排序…
                </div>
              )}
              {result.items.map((item, index) => (
                <article key={`${item.color_id}-${item.product_id}`} className="card-surface hover-lift overflow-hidden">
                  <div className="flex gap-3 p-3">
                    <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-lg bg-muted">
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.title} className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="h-full w-full" style={{ background: `linear-gradient(135deg, ${item.color.hex}, ${item.color.hex}99)` }} />
                      )}
                      <span className="absolute left-1 top-1 rounded bg-black/55 px-1.5 py-0.5 font-mono text-[9px] text-white backdrop-blur">
                        #{index + 1}
                      </span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-[12.5px] font-semibold">{item.display_name || item.title}</h3>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[10.5px] text-muted-foreground">
                            <span className="truncate">{item.shop_name || '未标注店铺'}</span>
                            <span>·</span>
                            <span className="truncate">{item.material || '毛布'}</span>
                            <span>·</span>
                            <span className="truncate">{item.pile_length || '未标注'}</span>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-[12.5px] font-semibold tnum">{formatPrice(item.price_cents)}</div>
                          <div className="mt-0.5 text-[9px] text-muted-foreground">参考价</div>
                        </div>
                      </div>

                      <div className="mt-2 flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1.5">
                        <ColorDot hex={item.color.hex} size={14} />
                        <span className="truncate text-[10.5px] font-medium">{item.color.name}</span>
                        <span className="font-mono text-[9.5px] text-muted-foreground">{item.color.hex}</span>
                        <span className="ml-auto flex items-center gap-1.5">
                          <LevelBadge level={item.level} />
                          <span className="font-mono text-[9.5px] text-muted-foreground">ΔE {item.delta_e.toFixed(1)}</span>
                        </span>
                      </div>

                      <div className="mt-2 flex items-end justify-between gap-2">
                        <p className="line-clamp-2 min-w-0 text-[10.5px] leading-relaxed text-muted-foreground">
                          {item.reason || '色差在可接受范围内，适合作为主色或大面积铺色。'}
                        </p>
                        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2 text-[10.5px]" asChild>
                          <a href={item.product_url || item.shop_url} target="_blank" rel="noreferrer noopener">
                            去购买
                            <ArrowUpRight className="h-3 w-3" />
                          </a>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between border-t border-border/50 px-3 py-1.5">
                    <div className="flex items-center gap-2 text-[9.5px] text-muted-foreground">
                      <span>相似度 {Math.round(item.score)}%</span>
                      <span className="h-1 w-1 rounded-full bg-border" />
                      <span>色号 {item.color.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="mr-1 text-[9px] text-muted-foreground">有帮助吗</span>
                      <button
                        type="button"
                        onClick={() => sendFeedback(result.log_id, 1)}
                        className={cn(
                          'rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-emerald-600',
                          feedback[result.log_id] === 1 && 'text-emerald-600',
                        )}
                        aria-label="推荐有帮助"
                      >
                        <ThumbsUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => sendFeedback(result.log_id, -1)}
                        className={cn(
                          'rounded p-1 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-amber-600',
                          feedback[result.log_id] === -1 && 'text-amber-600',
                        )}
                        aria-label="推荐不符合"
                      >
                        <ThumbsDown className="h-3 w-3" />
                      </button>
                      {feedback[result.log_id] && <Check className="h-3 w-3 text-emerald-600" />}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>

      {hover && imageSrc && imageSize.width > 0 && (
        <Magnifier
          imageSrc={imageSrc}
          width={imageSize.width}
          height={imageSize.height}
          x={hover.x}
          y={hover.y}
          hex={hover.hex}
          clientX={hover.clientX}
          clientY={hover.clientY}
        />
      )}

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-[420px]">
          <DialogHeader>
            <DialogTitle className="text-[15px]">重命名颜色标签</DialogTitle>
            <DialogDescription>只改显示名称，不影响色值与匹配结果。</DialogDescription>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={30}
            placeholder="例如：客户 A 的珊瑚色"
            onKeyDown={(event) => {
              if (event.key === 'Enter') renameActiveTab()
            }}
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setRenameOpen(false)}>
              取消
            </Button>
            <Button size="sm" onClick={renameActiveTab} disabled={!renameValue.trim()}>
              保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={analyzeOpen} onOpenChange={setAnalyzeOpen}>
        <DialogContent className="max-w-[520px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-[15px]">
              <Sparkles className="h-4 w-4 text-primary" />
              AI 色彩解读
            </DialogTitle>
            <DialogDescription>基于 {aiStatus?.model || '当前模型'} 生成，仅供参考，实物颜色以样卡为准。</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
            <span className="h-10 w-10 rounded-lg ring-1 ring-inset ring-black/10" style={{ backgroundColor: hex }} />
            <div>
              <div className="font-mono text-[12px] font-medium">{hex}</div>
              <div className="text-[10.5px] text-muted-foreground">{target?.family ? `${target.family}色系` : '色彩分析'}</div>
            </div>
          </div>
          {analyzeLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
              <Skeleton className="h-3 w-4/5" />
            </div>
          ) : analyzeError ? (
            <p className="py-2 text-[12px] text-destructive">{analyzeError}</p>
          ) : (
            <div className="whitespace-pre-wrap py-1 text-[12.5px] leading-relaxed text-foreground/85">{analyzeText}</div>
          )}
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setAnalyzeOpen(false)}>
              知道了
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
