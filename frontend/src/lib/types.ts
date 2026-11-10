export type Role = 'admin' | 'user'

export interface User {
  id: number
  username: string
  display_name: string
  role: Role
  is_active: boolean
  created_at: string | null
  last_login_at: string | null
}

export interface Permissions {
  can_manage: boolean
}

export interface AuthResponse {
  user: User
  permissions: Permissions
}

export interface ColorLab {
  l: number
  a: number
  b: number
}

export interface ProductColor {
  id: number
  product_id: number
  name: string
  hex: string
  lab: ColorLab
  family: string
  is_primary: boolean
  product?: {
    id: number
    title: string
    image_url: string
    price_cents: number | null
    shop_name: string
    product_url: string
    status: string
  }
}

export type ProductStatus = 'active' | 'draft' | 'archived'

export interface Product {
  id: number
  title: string
  display_name: string
  shop_name: string
  shop_url: string
  product_url: string
  external_id: string
  image_url: string
  price_cents: number | null
  currency: string
  material: string
  pile_length: string
  width_cm: number | null
  weight_gsm: number | null
  description: string
  tags: string[]
  status: ProductStatus
  source: string
  colors: ProductColor[]
  created_at: string | null
  updated_at: string | null
}

export interface ProductFilters {
  q: string
  status: string
  material: string
  shop: string
  family: string
  sort: string
}

export interface FilterOptions {
  materials: string[]
  shops: string[]
  families: string[]
  statuses: { value: string; label: string }[]
}

export interface Paged<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  pages: number
}

export interface ColorGroup {
  hex: string
  name: string
  family: string
  shop_name: string
  count: number
  lab: ColorLab
  text_color: string
  distance?: number
  match_level?: MatchLevel
  sample: {
    id: number | null
    title: string
    image_url: string
    price_cents: number | null
    shop_name: string
    shop_url: string
    product_url: string
  }
}

export interface FamilyCount {
  family: string
  count: number
}

export interface ColorTarget {
  hex: string
  rgb: { r: number; g: number; b: number }
  hsl: { h: number; s: number; l: number }
  lab: ColorLab
  family: string
  text_color: string
}

export type MatchLevel = 'close' | 'similar' | 'inspiration'

export interface RecommendItem {
  color_id: number
  product_id: number
  title: string
  display_name: string
  material: string
  pile_length: string
  shop_name: string
  shop_url: string
  product_url: string
  image_url: string
  price_cents: number | null
  color: { name: string; hex: string; family: string; is_primary: boolean }
  delta_e: number
  score: number
  ai_score: number | null
  level: MatchLevel
  reason: string
  product_status: string
}

export type RecommendMode = 'local' | 'ai'

export interface RecommendResult {
  hex: string
  target: ColorTarget
  mode: 'local' | 'ai' | 'local_fallback'
  provider: string
  ai_error: string
  summary: string
  advice: string
  caution: string
  items: RecommendItem[]
  elapsed_ms: number
  log_id: number
}

export interface RecommendHistoryItem {
  id: number
  hex: string
  mode: string
  provider: string
  summary: string
  elapsed_ms: number
  feedback: number
  count: number
  created_at: string | null
  items?: unknown[]
}

export interface AIStatus {
  enabled: boolean
  provider: 'deepseek' | 'ollama'
  model: string
  configured: boolean
}

export interface OllamaModel {
  name: string
  size: number
  modified_at?: string
  family?: string
  parameter_size?: string
  quantization_level?: string
}

export interface OllamaModelsResponse {
  ok: boolean
  base_url: string
  models: OllamaModel[]
  current: string
  suggested: string
  message?: string
  code?: string
}

export interface AIConfig {
  enabled: boolean
  provider: 'deepseek' | 'ollama'
  deepseek_base_url: string
  deepseek_model: string
  deepseek_api_key: string
  deepseek_configured: boolean
  ollama_base_url: string
  ollama_model: string
  temperature: number
  timeout_seconds: number
  prompt_deepseek: string
  prompt_ollama: string
  prompt_analyze: string
}

export interface Stats {
  products: { total: number; active: number; draft: number; archived: number }
  colors: { total: number; distinct: number }
  shops: number
  recommendations: { last_7d: number; ai_last_7d: number }
  families: FamilyCount[]
  shop_distribution: { shop: string; count: number }[]
  recent_products: Product[]
  daily: { date: string; count: number }[]
}

export interface ImportResult {
  format: 'json' | 'csv'
  dry_run: boolean
  total_rows: number
  created: number
  updated: number
  skipped: number
  errors: { row?: number; index?: number; message: string }[]
  error_count: number
  preview: {
    title: string
    shop_name?: string
    hex?: string
    colors?: { name?: string; hex: string }[] | string
    price_cents?: number | null
    action: string
  }[]
}

export interface TaobaoSyncStatus {
  available: boolean
  count: number
  shops: string[]
  updated_at: string | null
  file?: string
}

export interface AlertLogItem {
  id: number
  user_id: number | null
  action: string
  target_type: string
  target_id: string
  detail: string
  created_at: string | null
}

export interface PublicSettings {
  'app.name'?: string
  'app.tagline'?: string
  'app.disclaimer'?: string
  'appearance.theme'?: string
  'appearance.density'?: string
  'recommend.default_mode'?: string
  'ai.enabled'?: boolean
}

export type SettingsValues = Record<string, unknown>
