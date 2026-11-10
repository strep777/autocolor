import type {
  AIConfig,
  AIStatus,
  AlertLogItem,
  AuthResponse,
  ColorGroup,
  FamilyCount,
  FilterOptions,
  ImportResult,
  OllamaModelsResponse,
  Paged,
  Product,
  ProductFilters,
  PublicSettings,
  RecommendHistoryItem,
  RecommendResult,
  SettingsValues,
  Stats,
  TaobaoSyncStatus,
  User,
} from './types'

export class ApiError extends Error {
  status: number
  code: string
  fields: { field: string; message: string }[]

  constructor(message: string, status: number, code = '', fields: { field: string; message: string }[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.fields = fields
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const isBinary =
    (typeof Blob !== 'undefined' && options.body instanceof Blob) ||
    (typeof ArrayBuffer !== 'undefined' && options.body instanceof ArrayBuffer)
  if (options.body && !isForm && !isBinary && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (isBinary && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/octet-stream')
  }
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'include',
      ...options,
      headers,
    })
  } catch {
    throw new ApiError('无法连接服务器，请检查后端是否启动', 0, 'network_error')
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    const payload = (data || {}) as { detail?: string; code?: string; fields?: { field: string; message: string }[] }
    if (response.status === 401 && !path.startsWith('/auth/login')) {
      window.dispatchEvent(new CustomEvent('pc:unauthorized'))
    }
    throw new ApiError(payload.detail || `请求失败（${response.status}）`, response.status, payload.code || '', payload.fields || [])
  }
  return data as T
}

export function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

interface ProductPayload {
  title: string
  shop_name?: string
  shop_url?: string
  product_url?: string
  external_id?: string
  image_url?: string
  price_cents?: number | null
  material?: string
  width_cm?: number | null
  weight_gsm?: number | null
  description?: string
  tags?: string[]
  status?: string
  colors?: { name: string; hex: string; is_primary?: boolean }[]
}

interface UploadSession {
  upload_id: string
  chunk_size: number
  offset: number
  size: number
}

export interface UploadedImage {
  url: string
  original_url?: string
  preview_url?: string | null
  name: string
  size: number
  type: string
  max_mb: number
  chunked?: boolean
}

async function uploadLarge(file: File, onProgress?: (uploaded: number, total: number) => void): Promise<UploadedImage> {
  const session = await request<UploadSession>('/uploads/sessions', {
    method: 'POST',
    body: JSON.stringify({ filename: file.name, size: file.size, content_type: file.type }),
  })
  const chunkSize = Math.max(1024 * 1024, session.chunk_size || 16 * 1024 * 1024)
  let offset = 0
  try {
    while (offset < file.size) {
      const end = Math.min(file.size, offset + chunkSize)
      const chunk = file.slice(offset, end)
      let lastError: unknown = null
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const result = await request<{ offset: number; done: boolean }>(
            `/uploads/sessions/${session.upload_id}?offset=${offset}`,
            { method: 'PUT', body: chunk },
          )
          offset = result.offset
          onProgress?.(offset, file.size)
          lastError = null
          break
        } catch (err) {
          lastError = err
          if (err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 408 && err.status !== 429) {
            break
          }
          await new Promise((resolve) => setTimeout(resolve, 600 * (attempt + 1)))
        }
      }
      if (lastError) throw lastError
    }
    return await request<UploadedImage>(`/uploads/sessions/${session.upload_id}/complete`, { method: 'POST' })
  } catch (err) {
    request(`/uploads/sessions/${session.upload_id}`, { method: 'DELETE' }).catch(() => undefined)
    throw err
  }
}

export const api = {
  auth: {
    login: (username: string, password: string) =>
      request<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
    logout: () => request<{ ok: boolean }>('/auth/logout', { method: 'POST' }),
    me: () => request<AuthResponse>('/auth/me'),
    changePassword: (current_password: string, new_password: string) =>
      request<{ ok: boolean; message: string }>('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ current_password, new_password }),
      }),
  },

  products: {
    list: (filters: Partial<ProductFilters>, page = 1, pageSize = 20) =>
      request<Paged<Product>>(
        `/products${queryString({
          q: filters.q,
          status: filters.status,
          material: filters.material,
          shop: filters.shop,
          family: filters.family,
          sort: filters.sort,
          page,
          page_size: pageSize,
        })}`,
      ),
    get: (id: number) => request<{ product: Product }>(`/products/${id}`),
    create: (payload: ProductPayload) =>
      request<{ product: Product }>('/products', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: Partial<ProductPayload>) =>
      request<{ product: Product }>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    remove: (id: number) => request<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    bulk: (payload: {
      action: 'activate' | 'deactivate' | 'archive' | 'delete'
      ids?: number[]
      all?: boolean
      filters?: Partial<ProductFilters>
    }) => request<{ ok: boolean; affected: number; message: string }>('/products/bulk', { method: 'POST', body: JSON.stringify(payload) }),
    filters: () => request<FilterOptions>('/products/filters'),
    importProducts: (payload: { content: string; format?: string; mode?: string; dry_run?: boolean }) =>
      request<ImportResult>('/products/import', { method: 'POST', body: JSON.stringify(payload) }),
    importTemplate: () => request<{ json: string; csv: string }>('/products/import/template'),
    taobaoSyncStatus: () => request<TaobaoSyncStatus>('/products/sync/taobao/status'),
    taobaoSyncImport: () => request<ImportResult>('/products/sync/taobao/import', { method: 'POST' }),
    exportUrl: (format: 'json' | 'csv', filters: Partial<ProductFilters>) =>
      `/api/products/export${queryString({ format, ...filters })}`,
  },

  colors: {
    list: (params: { family?: string; q?: string; sort?: string; page?: number; page_size?: number }) =>
      request<Paged<ColorGroup>>(`/colors${queryString(params)}`),
    families: () => request<{ items: FamilyCount[]; total: number }>('/colors/families'),
  },

  recommend: {
    create: (payload: {
      hex: string
      mode: 'local' | 'ai'
      provider?: string
      limit?: number
      material?: string
      scene?: string
      only_close?: boolean
    }) => request<RecommendResult>('/recommend', { method: 'POST', body: JSON.stringify(payload) }),
    history: (limit = 12) => request<{ items: RecommendHistoryItem[] }>(`/recommend/history${queryString({ limit })}`),
    feedback: (id: number, value: 1 | -1) =>
      request<{ id: number; feedback: number }>(`/recommend/${id}/feedback`, {
        method: 'POST',
        body: JSON.stringify({ value }),
      }),
  },

  ai: {
    status: () => request<AIStatus>('/ai/status'),
    config: () => request<AIConfig>('/ai/config'),
    updateConfig: (payload: Partial<AIConfig>) =>
      request<AIConfig>('/ai/config', { method: 'PUT', body: JSON.stringify(payload) }),
    defaultPrompts: () => request<{ deepseek: string; ollama: string; analyze: string }>('/ai/prompts/default'),
    ollamaModels: (baseUrl?: string) =>
      request<OllamaModelsResponse>(`/ai/ollama/models${baseUrl ? `?base_url=${encodeURIComponent(baseUrl)}` : ''}`),
    test: (provider: 'deepseek' | 'ollama') =>
      request<{ ok: boolean; message?: string; code?: string; reply?: string; elapsed_ms?: number }>('/ai/test', {
        method: 'POST',
        body: JSON.stringify({ provider }),
      }),
    analyze: (payload: { hex: string; note?: string; provider?: string }) =>
      request<{ text: string; provider: string; elapsed_ms: number; hex: string }>('/ai/analyze', {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
  },

  settings: {
    public: () => request<PublicSettings>('/settings/public'),
    get: () => request<{ values: SettingsValues }>('/settings'),
    update: (values: SettingsValues) =>
      request<{ values: SettingsValues }>('/settings', { method: 'PUT', body: JSON.stringify({ values }) }),
    resetDemo: () => request<{ ok: boolean; removed: number; message: string }>('/settings/reset-demo', { method: 'POST' }),
    restorePrompts: () => request<{ ok: boolean; message: string }>('/settings/restore-prompts', { method: 'POST' }),
    audit: () => request<{ items: AlertLogItem[] }>('/settings/audit'),
  },

  users: {
    list: (q = '', page = 1, pageSize = 20) =>
      request<Paged<User>>(`/users${queryString({ q, page, page_size: pageSize })}`),
    create: (payload: { username: string; password: string; display_name?: string; role: string }) =>
      request<{ user: User }>('/users', { method: 'POST', body: JSON.stringify(payload) }),
    update: (id: number, payload: { display_name?: string; role?: string; is_active?: boolean }) =>
      request<{ user: User }>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
    remove: (id: number) => request<{ ok: boolean }>(`/users/${id}`, { method: 'DELETE' }),
    resetPassword: (id: number, new_password: string) =>
      request<{ ok: boolean; message: string }>(`/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password }),
      }),
  },

  stats: () => request<Stats>('/stats'),

  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return request<UploadedImage>('/uploads/images', {
      method: 'POST',
      body: form,
    })
  },

  uploadLarge,
}
