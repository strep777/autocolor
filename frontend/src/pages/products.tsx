import * as React from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ArrowDownUp,
  Download,
  ExternalLink,
  ImagePlus,
  LayoutGrid,
  List,
  Loader2,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react'

import { useAuth } from '@/components/auth-provider'
import { ColorDot, ConfirmDialog, EmptyState, PageHeader, Pagination, ProductThumb, StatusBadge } from '@/components/common'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/sonner'
import { api, ApiError } from '@/lib/api'
import { normalizeHex, rgbToHex } from '@/lib/colors'
import type { FilterOptions, Paged, Product, ProductColor, ProductFilters, ProductStatus } from '@/lib/types'
import { cn, copyText, formatPrice, relativeTime } from '@/lib/utils'

const DEFAULT_FILTERS: ProductFilters = {
  q: '',
  status: '',
  material: '',
  shop: '',
  family: '',
  sort: 'updated_desc',
}

const SORT_OPTIONS = [
  { value: 'updated_desc', label: '最近更新' },
  { value: 'created_desc', label: '最新创建' },
  { value: 'price_asc', label: '价格从低到高' },
  { value: 'price_desc', label: '价格从高到低' },
  { value: 'title', label: '名称 A → Z' },
]

const STATUS_OPTIONS: { value: ProductStatus; label: string }[] = [
  { value: 'active', label: '在售' },
  { value: 'draft', label: '草稿' },
  { value: 'archived', label: '已归档' },
]

type ColorDraft = { name: string; hex: string; is_primary: boolean }

interface FormState {
  title: string
  shop_name: string
  shop_url: string
  product_url: string
  image_url: string
  price: string
  material: string
  pile_length: string
  width_cm: string
  weight_gsm: string
  description: string
  tags: string
  status: ProductStatus
  colors: ColorDraft[]
}

const EMPTY_FORM: FormState = {
  title: '',
  shop_name: '',
  shop_url: '',
  product_url: '',
  image_url: '',
  price: '',
  material: '',
  pile_length: '',
  width_cm: '',
  weight_gsm: '',
  description: '',
  tags: '',
  status: 'active',
  colors: [{ name: '主色', hex: '#C9B79C', is_primary: true }],
}

function productToForm(product: Product): FormState {
  return {
    title: product.title,
    shop_name: product.shop_name || '',
    shop_url: product.shop_url || '',
    product_url: product.product_url || '',
    image_url: product.image_url || '',
    price: product.price_cents != null ? (product.price_cents / 100).toFixed(2) : '',
    material: product.material || '',
    pile_length: product.pile_length || '',
    width_cm: product.width_cm != null ? String(product.width_cm) : '',
    weight_gsm: product.weight_gsm != null ? String(product.weight_gsm) : '',
    description: product.description || '',
    tags: (product.tags || []).join(', '),
    status: (product.status as ProductStatus) || 'active',
    colors: product.colors.length
      ? product.colors.map((color) => ({ name: color.name, hex: color.hex, is_primary: color.is_primary }))
      : [{ name: '主色', hex: '#C9B79C', is_primary: true }],
  }
}

function ColorChip({ color, max = 3 }: { color: ProductColor[]; max?: number }) {
  return (
    <div className="flex items-center gap-1">
      {color.slice(0, max).map((item) => (
        <span
          key={item.id}
          className="inline-flex items-center gap-1 rounded-md bg-muted/60 py-0.5 pl-1 pr-1.5"
          title={`${item.name} ${item.hex}`}
        >
          <ColorDot hex={item.hex} size={10} />
          <span className="max-w-[52px] truncate text-[9.5px] text-muted-foreground">{item.name}</span>
        </span>
      ))}
      {color.length > max && <span className="text-[9.5px] text-muted-foreground">+{color.length - max}</span>}
    </div>
  )
}

function ProductFormDialog({
  open,
  onOpenChange,
  product,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  product: Product | null
  onSaved: () => void
}) {
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [uploadProgress, setUploadProgress] = React.useState(0)
  const [errors, setErrors] = React.useState<string[]>([])
  const uploadRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    if (!open) return
    setForm(product ? productToForm(product) : EMPTY_FORM)
    setErrors([])
  }, [open, product])

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const setColor = (index: number, patch: Partial<ColorDraft>) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.map((color, i) => (i === index ? { ...color, ...patch } : color)),
    }))
  }

  const setPrimary = (index: number) => {
    setForm((current) => ({
      ...current,
      colors: current.colors.map((color, i) => ({ ...color, is_primary: i === index })),
    }))
  }

  const addColor = () => {
    setForm((current) => ({
      ...current,
      colors: [...current.colors, { name: '', hex: '#E4D5BF', is_primary: current.colors.length === 0 }],
    }))
  }

  const removeColor = (index: number) => {
    setForm((current) => {
      const colors = current.colors.filter((_, i) => i !== index)
      if (colors.length && !colors.some((color) => color.is_primary)) colors[0].is_primary = true
      return { ...current, colors: colors.length ? colors : EMPTY_FORM.colors }
    })
  }

  const uploadImage = async (file: File | undefined) => {
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error('只支持 JPG、PNG、WebP 图片')
      return
    }
    setUploading(true)
    setUploadProgress(0)
    try {
      const result = await api.uploadLarge(file, (done, total) => {
        setUploadProgress(total ? Math.round((done / total) * 100) : 0)
      })
      set('image_url', result.url)
      toast.success('图片已上传', { description: '大图已按原文件保存，展示图自动压缩' })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const title = form.title.trim()
    if (!title) {
      setErrors(['请填写商品名称'])
      return
    }
    const colors = form.colors
      .map((color) => ({ name: color.name.trim(), hex: normalizeHex(color.hex) || '', is_primary: color.is_primary }))
      .filter((color) => color.hex)
    if (!colors.length) {
      setErrors(['至少填写一个有效色号（#RRGGBB）'])
      return
    }
    if (!colors.some((color) => color.is_primary)) colors[0].is_primary = true
    const price = form.price.trim() ? Number(form.price) : null
    if (price != null && (!Number.isFinite(price) || price < 0)) {
      setErrors(['价格需要填写为非负数字'])
      return
    }
    const payload = {
      title,
      shop_name: form.shop_name.trim(),
      shop_url: form.shop_url.trim(),
      product_url: form.product_url.trim(),
      image_url: form.image_url.trim(),
      price_cents: price != null ? Math.round(price * 100) : null,
      material: form.material.trim(),
      pile_length: form.pile_length.trim(),
      width_cm: form.width_cm.trim() ? Number(form.width_cm) : null,
      weight_gsm: form.weight_gsm.trim() ? Number(form.weight_gsm) : null,
      description: form.description.trim(),
      tags: form.tags
        .split(/[,，、;；]/)
        .map((tag) => tag.trim())
        .filter(Boolean),
      status: form.status,
      colors,
    }
    setSaving(true)
    setErrors([])
    try {
      if (product) await api.products.update(product.id, payload)
      else await api.products.create(payload)
      toast.success(product ? '商品已更新' : '商品已添加')
      onOpenChange(false)
      onSaved()
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors([err.message, ...err.fields.map((field) => field.message)])
      } else {
        setErrors(['保存失败，请稍后重试'])
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-[760px] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? '编辑商品' : '添加毛布商品'}</DialogTitle>
          <DialogDescription>
            填写商品基础信息与色号。色号会自动换算为 Lab，用于找色匹配；主色只用于界面展示。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
            <div>
              <Label className="mb-1.5 block">商品图片</Label>
              <button
                type="button"
                onClick={() => uploadRef.current?.click()}
                className="group relative flex h-[132px] w-full items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 text-center transition-colors hover:border-primary/50"
              >
                {form.image_url ? (
                  <img src={form.image_url} alt="商品预览" className="h-full w-full object-cover" />
                ) : (
                  <div className="px-3 text-muted-foreground">
                    <ImagePlus className="mx-auto mb-1.5 h-5 w-5" />
                    <div className="text-[10.5px]">点击上传 JPG/PNG/WebP</div>
                    <div className="mt-0.5 text-[9.5px] opacity-70">不限大小 · 分片断点续传</div>
                  </div>
                )}
                {form.image_url && (
                  <span className="absolute inset-0 hidden items-center justify-center bg-black/45 text-[11px] font-medium text-white group-hover:flex">
                    {uploading ? `上传中 ${uploadProgress}%` : '更换图片'}
                  </span>
                )}
                {uploading && (
                  <span className="absolute inset-x-0 bottom-0 h-1 bg-black/20">
                    <span className="block h-full bg-primary transition-all" style={{ width: `${uploadProgress}%` }} />
                  </span>
                )}
                {uploading && !form.image_url && <Loader2 className="absolute h-4 w-4 animate-spin text-primary" />}
              </button>
              <input
                ref={uploadRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(event) => uploadImage(event.target.files?.[0])}
              />
              <Input
                value={form.image_url}
                onChange={(event) => set('image_url', event.target.value)}
                placeholder="或粘贴图片 URL"
                className="mt-2 h-8 text-[11px]"
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="product-title">商品名称 *</Label>
                <Input
                  id="product-title"
                  value={form.title}
                  onChange={(event) => set('title', event.target.value)}
                  placeholder="例如：奶油白法兰绒毛毯"
                  maxLength={120}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="product-shop">店铺名称</Label>
                  <Input
                    id="product-shop"
                    value={form.shop_name}
                    onChange={(event) => set('shop_name', event.target.value)}
                    placeholder="海鲜毛布"
                    list="shop-options"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-material">材质</Label>
                  <Input
                    id="product-material"
                    value={form.material}
                    onChange={(event) => set('material', event.target.value)}
                    placeholder="法兰绒 / 珊瑚绒"
                    maxLength={40}
                  />
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="space-y-1.5">
                  <Label htmlFor="product-pile">毛布类型 / 毛高</Label>
                  <Input
                    id="product-pile"
                    value={form.pile_length}
                    onChange={(event) => set('pile_length', event.target.value)}
                    placeholder="4.5cm / 7mm"
                    maxLength={20}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-price">参考价（元）</Label>
                  <Input
                    id="product-price"
                    value={form.price}
                    onChange={(event) => set('price', event.target.value)}
                    placeholder="39.90"
                    inputMode="decimal"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-width">幅宽（cm）</Label>
                  <Input
                    id="product-width"
                    value={form.width_cm}
                    onChange={(event) => set('width_cm', event.target.value)}
                    placeholder="150"
                    inputMode="numeric"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="product-weight">克重（g/㎡）</Label>
                  <Input
                    id="product-weight"
                    value={form.weight_gsm}
                    onChange={(event) => set('weight_gsm', event.target.value)}
                    placeholder="280"
                    inputMode="numeric"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product-url">商品购买链接</Label>
              <Input
                id="product-url"
                value={form.product_url}
                onChange={(event) => set('product_url', event.target.value)}
                placeholder="https://item.taobao.com/item.htm?id=…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="product-shop-url">店铺链接</Label>
              <Input
                id="product-shop-url"
                value={form.shop_url}
                onChange={(event) => set('shop_url', event.target.value)}
                placeholder="https://shop…taobao.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>色号 *</Label>
              <span className="text-[10px] text-muted-foreground">第一个色号建议设为主色，最多 200 个</span>
            </div>
            <div className="space-y-2">
              {form.colors.map((color, index) => (
                <div key={index} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2">
                  <div className="relative h-8 w-8 shrink-0 overflow-hidden rounded-md ring-1 ring-inset ring-black/10" style={{ backgroundColor: color.hex }}>
                    <input
                      type="color"
                      value={normalizeHex(color.hex) || '#C9B79C'}
                      onChange={(event) => setColor(index, { hex: event.target.value.toUpperCase() })}
                      className="absolute -inset-2 h-[calc(100%+16px)] w-[calc(100%+16px)] cursor-pointer border-0 bg-transparent p-0"
                      aria-label={`色号 ${index + 1} 颜色`}
                    />
                  </div>
                  <Input
                    value={color.name}
                    onChange={(event) => setColor(index, { name: event.target.value })}
                    placeholder="色名，如 奶油白"
                    className="h-8 flex-1 text-[11.5px]"
                    maxLength={40}
                  />
                  <Input
                    value={color.hex}
                    onChange={(event) => setColor(index, { hex: event.target.value.toUpperCase() })}
                    placeholder="#C9B79C"
                    className="h-8 w-[96px] font-mono text-[11px]"
                    maxLength={7}
                  />
                  <button
                    type="button"
                    onClick={() => setPrimary(index)}
                    className={cn(
                      'shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors',
                      color.is_primary ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    主色
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => removeColor(index)}
                    aria-label="删除色号"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" size="sm" className="h-8 w-full border-dashed text-[11px]" onClick={addColor}>
              <Plus className="h-3.5 w-3.5" /> 添加色号
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
            <div className="space-y-1.5">
              <Label htmlFor="product-tags">标签</Label>
              <Input
                id="product-tags"
                value={form.tags}
                onChange={(event) => set('tags', event.target.value)}
                placeholder="用逗号分隔，例如：秋冬, 加厚, 素色"
              />
            </div>
            <div className="space-y-1.5">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={(value) => set('status', value as ProductStatus)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="product-desc">描述</Label>
            <Textarea
              id="product-desc"
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="手感、适用场景、色差说明…"
              rows={3}
            />
          </div>

          {errors.length > 0 && (
            <div className="space-y-1 rounded-lg border border-destructive/25 bg-destructive/[0.06] px-3 py-2.5 text-[11.5px] text-destructive">
              {errors.map((message, index) => (
                <div key={index}>{message}</div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button type="submit" disabled={saving || uploading}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {product ? '保存修改' : '添加商品'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProductsPage() {
  const { permissions } = useAuth()
  const canManage = permissions.can_manage
  const [searchParams, setSearchParams] = useSearchParams()

  const [filters, setFilters] = React.useState<ProductFilters>(DEFAULT_FILTERS)
  const [searchText, setSearchText] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(20)
  const [data, setData] = React.useState<Paged<Product> | null>(null)
  const [options, setOptions] = React.useState<FilterOptions | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [view, setView] = React.useState<'table' | 'grid'>(() => {
    const saved = localStorage.getItem('pc-products-view')
    if (saved === 'grid' || saved === 'table') return saved
    return window.matchMedia('(max-width: 767px)').matches ? 'grid' : 'table'
  })
  const [selected, setSelected] = React.useState<Set<number>>(new Set())
  const [allFiltered, setAllFiltered] = React.useState(false)
  const [formOpen, setFormOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<Product | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<Product | null>(null)
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const loadOptions = React.useCallback(() => {
    api.products
      .filters()
      .then(setOptions)
      .catch(() => undefined)
  }, [])

  const load = React.useCallback(async () => {
    setLoading(true)
    try {
      const response = await api.products.list(filters, page, pageSize)
      setData(response)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '商品列表加载失败')
    } finally {
      setLoading(false)
    }
  }, [filters, page, pageSize])

  React.useEffect(() => {
    load()
  }, [load])

  React.useEffect(() => {
    loadOptions()
  }, [loadOptions])

  React.useEffect(() => {
    setSelected(new Set())
    setAllFiltered(false)
  }, [filters, page, pageSize])

  React.useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => (current.q === searchText ? current : { ...current, q: searchText }))
    }, 280)
    return () => window.clearTimeout(timer)
  }, [searchText])

  React.useEffect(() => {
    const create = searchParams.get('new')
    const editId = Number(searchParams.get('edit') || 0)
    if (!canManage) return
    if (create === '1') {
      setEditing(null)
      setFormOpen(true)
      setSearchParams({}, { replace: true })
    } else if (editId) {
      api.products
        .get(editId)
        .then((response) => {
          setEditing(response.product)
          setFormOpen(true)
        })
        .catch(() => toast.error('商品不存在或已被删除'))
        .finally(() => setSearchParams({}, { replace: true }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, canManage])

  const updateFilter = (key: keyof ProductFilters, value: string) => {
    setPage(1)
    setFilters((current) => ({ ...current, [key]: value }))
  }

  const resetFilters = () => {
    setSearchText('')
    setFilters(DEFAULT_FILTERS)
    setPage(1)
  }

  const pageIds = data?.items.map((product) => product.id) || []
  const pageAllSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))
  const someSelected = allFiltered || pageIds.some((id) => selected.has(id))
  const headerState: boolean | 'indeterminate' = allFiltered || pageAllSelected ? true : someSelected ? 'indeterminate' : false
  const selectedCount = allFiltered ? data?.total || 0 : selected.size

  const togglePage = () => {
    if (allFiltered) {
      setAllFiltered(false)
      setSelected(new Set())
      return
    }
    if (pageAllSelected) {
      const next = new Set(selected)
      pageIds.forEach((id) => next.delete(id))
      setSelected(next)
    } else {
      const next = new Set(selected)
      pageIds.forEach((id) => next.add(id))
      setSelected(next)
    }
  }

  const toggleOne = (id: number) => {
    setAllFiltered(false)
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const clearSelection = () => {
    setSelected(new Set())
    setAllFiltered(false)
  }

  const selectAllFiltered = () => {
    setAllFiltered(true)
    setSelected(new Set())
  }

  const bulkPayload = (action: 'activate' | 'deactivate' | 'archive' | 'delete') =>
    allFiltered ? { action, all: true, filters } : { action, ids: Array.from(selected) }

  const runBulk = async (action: 'activate' | 'deactivate' | 'archive' | 'delete') => {
    if (!selectedCount) return
    setBusy(true)
    try {
      const result = await api.products.bulk(bulkPayload(action))
      toast.success(result.message || '批量操作完成')
      clearSelection()
      await load()
      loadOptions()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '批量操作失败')
    } finally {
      setBusy(false)
      setBulkDeleteOpen(false)
    }
  }

  const removeOne = async () => {
    if (!deleteTarget) return
    setBusy(true)
    try {
      await api.products.remove(deleteTarget.id)
      toast.success('商品已删除')
      setDeleteTarget(null)
      clearSelection()
      await load()
      loadOptions()
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : '删除失败')
    } finally {
      setBusy(false)
    }
  }

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const openEdit = (product: Product) => {
    setEditing(product)
    setFormOpen(true)
  }

  const copyLink = async (product: Product) => {
    const link = product.product_url || product.shop_url
    if (!link) {
      toast.error('该商品还没有购买链接')
      return
    }
    // DropdownMenuItem 关闭时会恢复焦点，等菜单卸载后再复制，
    // 否则隐藏 textarea 会被下拉菜单的焦点管理立即夺走。
    await new Promise((resolve) => window.setTimeout(resolve, 80))
    if (await copyText(link)) {
      toast.success('购买链接已复制')
    } else {
      toast.error('复制失败，请手动选择链接')
    }
  }

  const changeView = (next: 'table' | 'grid') => {
    setView(next)
    localStorage.setItem('pc-products-view', next)
  }

  const exportProducts = (format: 'json' | 'csv') => {
    const link = document.createElement('a')
    link.href = api.products.exportUrl(format, filters)
    link.rel = 'noreferrer'
    link.click()
    toast.success(`正在导出 ${format.toUpperCase()}，请查看下载目录`)
  }

  const activeFilterCount = [filters.status, filters.material, filters.shop, filters.family].filter(Boolean).length

  return (
    <div className="space-y-4">
      <PageHeader
        title="商品库"
        description="毛布商品、色号与购买链接的统一入口。勾选后可批量上下架或删除，也可以全选当前筛选结果。"
        actions={
          <>
            {canManage && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-3.5 w-3.5" />
                    导出
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => exportProducts('csv')}>导出 CSV</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => exportProducts('json')}>导出 JSON</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {canManage && (
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4" />
                添加商品
              </Button>
            )}
          </>
        }
      />

      <div className="card-surface p-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 sm:max-w-[300px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="搜索名称、色号、店铺…"
              className="h-8 pl-8 pr-8 text-[12px]"
            />
            {searchText && (
              <button
                type="button"
                onClick={() => setSearchText('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted"
                aria-label="清空搜索"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <Select value={filters.status || 'all'} onValueChange={(value) => updateFilter('status', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-8 w-[104px] text-[11.5px]">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.material || 'all'} onValueChange={(value) => updateFilter('material', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-8 w-[112px] text-[11.5px]">
              <SelectValue placeholder="材质" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部材质</SelectItem>
              {(options?.materials || []).map((material) => (
                <SelectItem key={material} value={material}>
                  {material}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.shop || 'all'} onValueChange={(value) => updateFilter('shop', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-8 w-[120px] text-[11.5px]">
              <SelectValue placeholder="店铺" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部店铺</SelectItem>
              {(options?.shops || []).map((shop) => (
                <SelectItem key={shop} value={shop}>
                  {shop}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.family || 'all'} onValueChange={(value) => updateFilter('family', value === 'all' ? '' : value)}>
            <SelectTrigger className="h-8 w-[104px] text-[11.5px]">
              <SelectValue placeholder="色系" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部色系</SelectItem>
              {(options?.families || []).map((family) => (
                <SelectItem key={family} value={family}>
                  {family}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.sort} onValueChange={(value) => updateFilter('sort', value)}>
            <SelectTrigger className="h-8 w-[136px] text-[11.5px]">
              <ArrowDownUp className="mr-1 h-3 w-3 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {(activeFilterCount > 0 || searchText) && (
            <Button variant="ghost" size="sm" className="h-8 px-2 text-[11px] text-muted-foreground" onClick={resetFilters}>
              <X className="h-3 w-3" /> 清除筛选
            </Button>
          )}

          <div className="ml-auto flex items-center gap-1.5">
            <div className="flex items-center rounded-lg border border-border/70 p-0.5">
              <button
                type="button"
                onClick={() => changeView('table')}
                className={cn('rounded-md p-1.5', view === 'table' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                aria-label="表格视图"
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => changeView('grid')}
                className={cn('rounded-md p-1.5', view === 'grid' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}
                aria-label="卡片视图"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
            <Button variant="ghost" size="icon-sm" onClick={load} aria-label="刷新" disabled={loading}>
              <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
            </Button>
          </div>
        </div>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-4 py-2.5">
          <div className="text-[11.5px] text-muted-foreground">
            {loading ? '加载中…' : `共 ${data?.total ?? 0} 件商品${activeFilterCount ? '（已筛选）' : ''}`}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-muted-foreground">每页</span>
            <Select
              value={String(pageSize)}
              onValueChange={(value) => {
                setPageSize(Number(value))
                setPage(1)
              }}
            >
              <SelectTrigger className="h-7 w-[64px] text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[10, 20, 50, 100].map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {view === 'table' ? (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {canManage && (
                    <TableHead className="w-[38px] pl-4">
                      <Checkbox checked={headerState} onCheckedChange={togglePage} aria-label="全选当前页" />
                    </TableHead>
                  )}
                  <TableHead>商品</TableHead>
                  <TableHead className="hidden md:table-cell">色号</TableHead>
                  <TableHead className="hidden lg:table-cell">店铺 / 材质</TableHead>
                  <TableHead>价格</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="hidden xl:table-cell">更新</TableHead>
                  <TableHead className="w-[52px] text-right pr-4">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 6 }).map((_, index) => (
                    <TableRow key={index}>
                      {canManage && (
                        <TableCell className="pl-4">
                          <Skeleton className="h-4 w-4" />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Skeleton className="h-10 w-10 rounded-lg" />
                          <div className="space-y-1.5">
                            <Skeleton className="h-3 w-40" />
                            <Skeleton className="h-2.5 w-24" />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-3 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-3 w-14" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell className="hidden xl:table-cell"><Skeleton className="h-3 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-6" /></TableCell>
                    </TableRow>
                  ))
                ) : !data?.items.length ? (
                  <TableRow>
                    <TableCell colSpan={canManage ? 8 : 7} className="py-4">
                      <EmptyState
                        icon={Package}
                        title={filters.q || activeFilterCount ? '没有符合条件的商品' : '商品库还是空的'}
                        description={
                          filters.q || activeFilterCount
                            ? '换个关键词，或清除筛选条件再试。'
                            : canManage
                              ? '先导入 CSV / JSON，或手动添加第一件毛布商品。'
                              : '请联系管理员导入商品数据。'
                        }
                        action={
                          canManage ? (
                            <div className="flex gap-2">
                              <Button size="sm" onClick={openCreate}>
                                <Plus className="h-3.5 w-3.5" /> 添加商品
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => (window.location.href = '/import')}>
                                <Upload className="h-3.5 w-3.5" /> 批量导入
                              </Button>
                            </div>
                          ) : undefined
                        }
                      />
                    </TableCell>
                  </TableRow>
                ) : (
                  data.items.map((product) => {
                    const checked = allFiltered || selected.has(product.id)
                    return (
                      <TableRow key={product.id} data-state={checked ? 'selected' : undefined} className={cn(checked && 'bg-primary/[0.025]')}>
                        {canManage && (
                          <TableCell className="pl-4">
                            <Checkbox checked={checked} onCheckedChange={() => toggleOne(product.id)} aria-label={`选择 ${product.title}`} />
                          </TableCell>
                        )}
                        <TableCell>
                          <button type="button" className="flex min-w-0 items-center gap-2.5 text-left" onClick={() => (canManage ? openEdit(product) : undefined)}>
                            <ProductThumb product={product} className="h-10 w-10 shrink-0" rounded="rounded-lg" />
                            <div className="min-w-0">
                              <div className="max-w-[270px] truncate text-[12px] font-medium hover:text-primary">
                                {product.display_name || product.title}
                              </div>
                              <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                                <span className="truncate">{product.shop_name || '未标注店铺'}</span>
                                {product.pile_length && <span>· {product.pile_length}</span>}
                                {product.tags?.includes('示例') && (
                                  <span className="rounded bg-muted px-1 py-px text-[9px]">示例</span>
                                )}
                              </div>
                            </div>
                          </button>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <ColorChip color={product.colors} />
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          <div className="text-[11.5px]">{product.material || '—'}</div>
                          <div className="text-[10px] text-muted-foreground">{product.width_cm ? `${product.width_cm}cm` : ''}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <div className="text-[12px] font-medium tnum">{formatPrice(product.price_cents)}</div>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <StatusBadge status={product.status} />
                        </TableCell>
                        <TableCell className="hidden xl:table-cell">
                          <span className="text-[10.5px] text-muted-foreground">{relativeTime(product.updated_at)}</span>
                        </TableCell>
                        <TableCell className="pr-4 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon-sm" aria-label="更多操作">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuLabel>商品操作</DropdownMenuLabel>
                              {canManage && (
                                <DropdownMenuItem onSelect={() => openEdit(product)}>
                                  <Pencil /> 编辑
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onSelect={() => copyLink(product)}>
                                <ExternalLink /> 复制购买链接
                              </DropdownMenuItem>
                              {(product.product_url || product.shop_url) && (
                                <DropdownMenuItem asChild>
                                  <a href={product.product_url || product.shop_url} target="_blank" rel="noreferrer noopener">
                                    <ExternalLink /> 打开淘宝页面
                                  </a>
                                </DropdownMenuItem>
                              )}
                              {canManage && (
                                <>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem destructive onSelect={() => setDeleteTarget(product)}>
                                    <Trash2 /> 删除
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="p-3">
            {loading ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={index} className="h-[230px] rounded-xl" />
                ))}
              </div>
            ) : !data?.items.length ? (
              <EmptyState
                icon={Package}
                title={filters.q || activeFilterCount ? '没有符合条件的商品' : '商品库还是空的'}
                description={canManage ? '导入或添加商品后，这里会以卡片形式展示。' : '请联系管理员导入商品数据。'}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {data.items.map((product) => {
                  const checked = allFiltered || selected.has(product.id)
                  return (
                    <article
                      key={product.id}
                      className={cn('group relative overflow-hidden rounded-xl border border-border/70 bg-card transition-shadow hover:shadow-mac', checked && 'ring-2 ring-primary/40')}
                    >
                      <div className="relative h-[150px] overflow-hidden bg-muted">
                        <ProductThumb product={product} className="h-full w-full" rounded="rounded-none" />
                        <div className="absolute left-2 top-2">
                          <StatusBadge status={product.status} />
                        </div>
                        {canManage && (
                          <div className="absolute right-2 top-2">
                            <Checkbox
                              checked={checked}
                              onCheckedChange={() => toggleOne(product.id)}
                              className="border-white/60 bg-black/25 data-[state=checked]:bg-primary"
                              aria-label={`选择 ${product.title}`}
                            />
                          </div>
                        )}
                        {canManage && (
                          <div className="absolute inset-x-2 bottom-2 flex translate-y-1 justify-end gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100">
                            <Button size="sm" variant="secondary" className="h-7 bg-white/90 px-2 text-[10px] text-[#1D1D1F] hover:bg-white" onClick={() => openEdit(product)}>
                              <Pencil className="h-3 w-3" /> 编辑
                            </Button>
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <h3 className="truncate text-[12.5px] font-semibold" title={product.display_name || product.title}>
                          {product.display_name || product.title}
                        </h3>
                        <div className="mt-0.5 flex items-center gap-1 text-[10px] text-muted-foreground">
                          <span className="truncate">{product.shop_name || '未标注店铺'}</span>
                          <span>·</span>
                          <span className="truncate">{product.material || '毛布'}</span>
                          {product.pile_length && (
                            <>
                              <span>·</span>
                              <span>{product.pile_length}</span>
                            </>
                          )}
                        </div>
                        <div className="mt-2">
                          <ColorChip color={product.colors} max={4} />
                        </div>
                        <div className="mt-2.5 flex items-end justify-between">
                          <span className="text-[13px] font-semibold tnum">{formatPrice(product.price_cents)}</span>
                          <span className="text-[9.5px] text-muted-foreground">{relativeTime(product.updated_at)}</span>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {data && data.total > 0 && (
          <div className="border-t border-border/60 px-4 pb-3">
            <Pagination page={page} pages={data.pages} total={data.total} pageSize={pageSize} onChange={setPage} />
          </div>
        )}
      </div>

      {(selectedCount > 0 || allFiltered) && canManage && (
        <div className="sticky bottom-3 z-20 mx-auto flex w-fit max-w-full flex-wrap items-center gap-2 rounded-2xl border border-border/70 bg-card/95 px-3 py-2 shadow-mac-lg backdrop-blur-xl animate-slide-up">
          <span className="flex items-center gap-1.5 text-[11.5px]">
            已选中
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {selectedCount}
            </span>
            项
          </span>
          {!allFiltered && (data?.total || 0) > pageIds.length && (
            <button type="button" onClick={selectAllFiltered} className="text-[11px] text-primary hover:underline">
              全选全部 {data?.total} 项
            </button>
          )}
          {allFiltered && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] text-primary">全部筛选结果</span>}
          <span className="mx-1 h-4 w-px bg-border" />
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => runBulk('activate')}>
            上架
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => runBulk('deactivate')}>
            下架
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px]" disabled={busy} onClick={() => runBulk('archive')}>
            归档
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[11px] text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy} onClick={() => setBulkDeleteOpen(true)}>
            删除
          </Button>
          <Button variant="ghost" size="icon-sm" className="h-7 w-7 text-muted-foreground" onClick={clearSelection} aria-label="取消选择">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} onSaved={() => { load(); loadOptions() }} />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="删除这件商品？"
        description={
          <>
            将删除「{deleteTarget?.title}」及其 {deleteTarget?.colors.length || 0} 个色号，删除后无法恢复。
          </>
        }
        confirmLabel="删除"
        destructive
        loading={busy}
        onConfirm={removeOne}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`删除 ${selectedCount} 件商品？`}
        description={allFiltered ? '将删除当前筛选条件下的全部商品及其色号，此操作不可恢复。' : '将删除选中的商品及其色号，此操作不可恢复。'}
        confirmLabel="确认删除"
        destructive
        loading={busy}
        onConfirm={() => runBulk('delete')}
      />
    </div>
  )
}
