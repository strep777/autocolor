# API 接口规范

> Base URL：`/api` ｜ 格式：JSON（除上传为 multipart）｜ 认证：Cookie `pc_session`
> 所有时间字段为 ISO-8601 UTC；金额字段为“分”的整数；颜色统一 `#RRGGBB` 大写。
> 完整 OpenAPI 文档运行后见 `http://localhost:8000/api/docs`。

---

## 1. 通用约定

### 1.1 成功响应

列表统一：

```json
{ "items": [], "total": 0, "page": 1, "page_size": 20, "pages": 0 }
```

单资源直接返回对象。删除返回 `204 No Content`。

### 1.2 错误响应

```json
{ "detail": "用户名或密码错误", "code": "INVALID_CREDENTIALS" }
```

| HTTP | 含义 | 典型 code |
|---|---|---|
| 400 | 参数错误 | `VALIDATION_ERROR` |
| 401 | 未登录/会话过期 | `UNAUTHORIZED` |
| 403 | 无权限 | `FORBIDDEN` |
| 404 | 资源不存在 | `NOT_FOUND` |
| 409 | 冲突（重名/最后一个管理员） | `CONFLICT` |
| 422 | 结构校验失败（FastAPI） | `VALIDATION_ERROR` |
| 429 | 限流 | `RATE_LIMITED` |
| 500 | 服务器错误 | `INTERNAL_ERROR` |

### 1.3 认证

- 登录成功：`Set-Cookie: pc_session=<token>; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800`
- 生产（HTTPS）自动加 `Secure`。
- 所有写请求需同源 `Origin`；跨域直接 403。

### 1.4 分页与排序

`page`（默认 1）、`page_size`（默认 20，最大 100）、`sort`（如 `-created_at`、`title`）。

---

## 2. 认证 `/api/auth`

### POST `/api/auth/login`

```json
{ "username": "admin", "password": "admin123" }
```

200：

```json
{ "id": 1, "username": "admin", "display_name": "管理员", "role": "admin", "is_active": true }
```

错误：401 `INVALID_CREDENTIALS`；423 `ACCOUNT_DISABLED`；429 `RATE_LIMITED`。

### POST `/api/auth/logout` → 204

### GET `/api/auth/me` → 当前用户；未登录 401

### POST `/api/auth/password`

```json
{ "old_password": "...", "new_password": "至少8位，含字母与数字" }
```

204；旧密码错误 400 `INVALID_PASSWORD`。

---

## 3. 商品 `/api/products`

### GET `/api/products`

查询参数：`q`、`shop`、`material`、`status`（active/archived/all）、`family`、`tag`、`page`、`page_size`、`sort`。

商品对象：

```json
{
  "id": 12,
  "title": "加厚珊瑚绒 奶油白",
  "shop_name": "海鲜毛布",
  "shop_url": "https://shop315729358.taobao.com/",
  "product_url": "https://item.taobao.com/item.htm?id=...",
  "external_id": "700000000001",
  "image_url": "/uploads/xx.jpg",
  "price_cents": 3900,
  "currency": "CNY",
  "material": "珊瑚绒",
  "width_cm": 160,
  "weight_gsm": 320,
  "description": "",
  "tags": ["纯色", "加厚"],
  "status": "active",
  "colors": [
    { "id": 3, "name": "奶油白", "hex": "#F3E9D2", "lab_l": 92.1, "lab_a": 0.4, "lab_b": 10.2,
      "family": "米", "is_primary": true, "note": "" }
  ],
  "created_at": "2026-11-09T12:00:00Z",
  "updated_at": "2026-11-09T12:00:00Z"
}
```

### GET `/api/products/{id}` → 商品对象 / 404

### POST `/api/products`（admin）

```json
{
  "title": "加厚珊瑚绒",
  "shop_name": "海鲜毛布",
  "product_url": "https://item.taobao.com/item.htm?id=...",
  "image_url": "https://.../a.jpg",
  "price_cents": 3900,
  "material": "珊瑚绒",
  "description": "",
  "tags": ["纯色"],
  "status": "active",
  "colors": [
    { "name": "奶油白", "hex": "#F3E9D2", "is_primary": true },
    { "name": "雾霾蓝", "hex": "#9FB0BF" }
  ]
}
```

200 → `{ "product": ... }`。校验：标题 1–200；最多 200 个色号；hex 合法。

### PUT `/api/products/{id}`（admin）

同上（整体替换色号列表：带 id 的更新，不带的创建，缺失的删除）。

### DELETE `/api/products/{id}`（admin）→ 204

### POST `/api/products/bulk`（admin）

```json
{ "action": "archive", "ids": [1,2,3] }
```

action ∈ `archive|activate|delete`；返回 `{ "affected": 3 }`。`delete` 需前端二次确认。

### GET `/api/products/filters`

```json
{ "shops": ["海鲜毛布"], "materials": ["珊瑚绒"], "families": ["米","蓝"] }
```

### GET `/api/products/export?format=json|csv`（admin）→ 文件下载

### POST `/api/products/import`（admin）

```json
{ "items": [ { "title": "...", "shop_name": "...", "colors": [ ... ] } ], "mode": "merge" }
```

返回：

```json
{ "created": 10, "updated": 2, "skipped": 1, "errors": [ { "index": 3, "message": "标题为空" } ] }
```

`mode`：`merge`（按 external_id / title+shop 去重更新）或 `append`。

---

## 4. 色卡 `/api/colors`

色卡库是只读聚合视图，颜色通过商品的 `colors` 字段维护。

### GET `/api/colors`

参数：`q`（色名 / HEX / 店铺）、`family`、`sort=shop|code`、`page`、`page_size`。
聚合规则：先按「店铺 + 色名」去重，再按「店铺 + HEX」兜底合并；不同店铺互不影响。

当 `q` 是 3 位或 6 位 HEX（可带 `#`）时，接口按与目标色的 CIEDE2000 色差从近到远排序，并在每项返回 `distance` 与 `match_level`；此时 `sort` 不生效。其他文本仍按色名 / HEX / 店铺 / 色系过滤。

```json
{
  "items": [{
    "hex": "#F3E9D2", "name": "奶油白", "family": "米", "shop_name": "海鲜毛布",
    "count": 2, "distance": 2.8, "match_level": "close",
    "lab": { "l": 92.1, "a": 0.4, "b": 10.2 },
    "text_color": "#1D1D1F",
    "sample": {
      "id": 12, "title": "加厚珊瑚绒", "image_url": "/uploads/real/12.jpg",
      "price_cents": 3900, "shop_name": "海鲜毛布",
      "shop_url": "https://shop315729358.taobao.com/",
      "product_url": "https://item.taobao.com/item.htm?id=..."
    }
  }],
  "total": 580, "page": 1, "page_size": 60, "pages": 10
}
```

普通文本查询示例：`q=雾霾蓝` 或 `q=犬物`；色号查询示例：`q=C9879C`、`q=%23C9879C`、`q=CC9`。

### GET `/api/colors/families`

返回按色系聚合的店铺色数量，与 `/api/colors` 使用同一聚合函数：

```json
{ "items": [{ "family": "蓝", "count": 48 }], "total": 580 }
```

---

## 5. 推荐 `/api/recommend`

### POST `/api/recommend`

```json
{
  "hex": "#C8A27A",
  "mode": "local",
  "filters": { "material": "", "shop": "", "price_min": null, "price_max": null, "only_close": false },
  "limit": 8
}
```

响应：

```json
{
  "input": { "hex": "#C8A27A", "rgb": [200,162,122], "hsl": [30,41,63], "lab": [69.7,14.9,27.3], "family": "棕" },
  "mode": "local",
  "provider": null,
  "model": null,
  "ai_error": null,
  "elapsed_ms": 18,
  "advice": null,
  "items": [
    {
      "product": { "id": 12, "title": "...", "image_url": "...", "product_url": "...", "shop_name": "..." },
      "color": { "id": 3, "name": "焦糖", "hex": "#C9A077", "family": "棕" },
      "delta_e": 1.24,
      "score": 99.5,
      "level": "close",
      "reason": null
    }
  ]
}
```

- `mode`：`local`（默认）/ `ai`。
- `level`：`close`（ΔE≤3.5）/ `similar`（≤12）/ `inspiration`（>12）。
- 若 AI 失败：`mode="local_fallback"`，`ai_error` 为脱敏错误摘要，`items` 为本地结果。
- `advice`：AI 返回的整体搭配建议（字符串），本地模式为 null。
- 店铺覆盖：结果保证每个有在售商品的店铺至少出现 1 次；若 `limit` 小于店铺数，实际返回条数会提升到店铺数（最多 24）。`only_close=true` 时仅从阈值内的色号中覆盖，不强行补远色。

### GET `/api/recommend/history?limit=20` → 当前用户最近记录（不含完整商品图）

---

## 6. AI `/api/ai`

### GET `/api/ai/config`（admin）

```json
{
  "provider": "deepseek",
  "deepseek": { "base_url": "https://api.deepseek.com", "model": "deepseek-chat", "has_key": true, "api_key_masked": "••••••••ab12" },
  "ollama": { "base_url": "http://host.docker.internal:11434", "model": "qwen2.5:3b" },
  "temperature": 0.3,
  "timeout_seconds": 30,
  "prompts": { "deepseek": "...", "ollama": "..." }
}
```

### PUT `/api/ai/config`（admin）

```json
{
  "provider": "ollama",
  "deepseek": { "base_url": "...", "model": "...", "api_key": "sk-..." },
  "ollama": { "base_url": "...", "model": "..." },
  "temperature": 0.3,
  "timeout_seconds": 30,
  "prompts": { "deepseek": "...", "ollama": "..." }
}
```

`api_key` 传空字符串表示不修改；传 `null` 表示清除。

### GET `/api/ai/ollama/models?base_url=http://127.0.0.1:11434`（admin）

读取 Ollama `/api/tags`，用于设置页自动下拉；`base_url` 省略时取后台配置。

```json
{
  "ok": true,
  "base_url": "http://127.0.0.1:11434",
  "models": [
    { "name": "qwen2.5:3b", "size": 1927000000, "family": "qwen2", "parameter_size": "3.1B", "quantization_level": "Q4_K_M" }
  ],
  "current": "qwen2.5:3b",
  "suggested": "qwen2.5:3b",
  "message": "已读取 1 个本机模型"
}
```

服务不可达时仍返回 HTTP 200，`ok=false`、`models=[]`，并带中文 `message` 与 `code`（`ai_unreachable` / `ai_timeout` / `ai_not_found`），便于前端展示原因而不是抛 500。

### POST `/api/ai/test`（admin）

```json
{ "provider": "deepseek" }
```

```json
{ "ok": true, "latency_ms": 820, "message": "连接成功，模型 deepseek-chat" }
```

### POST `/api/ai/analyze`

```json
{ "hex": "#C8A27A", "question": "这个颜色适合做宠物窝吗？推荐三个搭配色。" }
```

```json
{ "ok": true, "provider": "deepseek", "model": "deepseek-chat", "text": "…", "latency_ms": 1500 }
```

限流：30 次/分钟/用户；未配置时返回 400 `AI_NOT_CONFIGURED`。

### GET `/api/ai/prompts/default?provider=deepseek`（admin）→ 默认 skill 全文

---

## 7. 设置与统计

### GET `/api/settings/public`（免登录）

```json
{ "site_title": "毛布选色 · 色研所", "theme": "system", "ai_enabled": true, "provider": "deepseek", "version": "1.0.0" }
```

### GET `/api/settings`（admin）→ 按组返回全部配置（敏感项脱敏）

### PUT `/api/settings`（admin）

```json
{ "items": [ { "key": "ui.theme", "value": "dark" }, { "key": "ai.deepseek.api_key", "value": "sk-..." } ] }
```

### GET `/api/stats`（登录）

```json
{
  "products": 42, "colors": 96, "users": 3, "recommendations": 128,
  "shops": 3, "recent": [ { "id": 1, "input_hex": "#C8A27A", "mode": "local", "created_at": "..." } ],
  "families": [ { "family": "米", "count": 20 } ]
}
```

### GET `/api/health`（免登录）

```json
{ "status": "ok", "version": "1.0.0", "db": "ok", "uptime_seconds": 120 }
```

---

## 8. 上传 `/api/uploads`（登录）

商品图上传不设应用层大小上限，支持 50GB 级文件；磁盘不足返回 `507 insufficient_storage`。

### 分片上传（推荐）

1. `POST /api/uploads/sessions`

```json
{ "filename": "big.jpg", "size": 53687091200, "content_type": "image/jpeg" }
```

```json
{ "upload_id": "883de121a08f45cf8d0a80a40a67c3aa", "chunk_size": 16777216, "offset": 0, "size": 53687091200 }
```

2. `PUT /api/uploads/sessions/{upload_id}?offset={已上传字节数}`，请求体为原始二进制分片（`application/octet-stream`）。偏移不一致返回 `409 offset_mismatch`，响应 `{ "offset": 16777216, "size": ..., "done": false }`。

3. `POST /api/uploads/sessions/{upload_id}/complete`

```json
{
  "url": "/uploads/xxx.preview.jpg",
  "original_url": "/uploads/xxx.jpg",
  "preview_url": "/uploads/xxx.preview.jpg",
  "name": "big.jpg",
  "size": 12582912,
  "type": "image/jpeg",
  "chunked": true
}
```

- 只接受 JPG/PNG/WebP，按文件头魔数校验；文件名不参与落盘路径。
- 512MB 以内的图片会生成 1600px 预览图并作为 `url`；更大的原图跳过同步解码，`url` 即原图地址，避免 50GB 文件拖死上传接口。
- `DELETE /api/uploads/sessions/{upload_id}` 取消并清理分片。

### 兼容的单请求上传

`POST multipart/form-data`，字段 `file`；无大小限制，按 1MB 块流式落盘，返回同上。

静态访问：`GET /uploads/{path}`，带长缓存与 `nosniff`。

---

## 9. 前端调用示例

```ts
const res = await fetch('/api/recommend', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ hex: '#C8A27A', mode: 'local', limit: 8 }),
});
if (!res.ok) throw new ApiError(await res.json());
```

约定：前端拦截 401 自动跳转登录；429 提示“操作过于频繁”。


## 附录：第二轮迭代新增接口与权限

### 匿名可读

- `GET /api/auth/me`：未登录返回 `{"user": null, "permissions": {"can_manage": false}}`（200）
- `GET /api/products`、`/filters`、`/{id}`：匿名可读；写接口仍需管理员
- `GET /api/colors`、`/families`：匿名可读；`sort=shop|code`
- `POST /api/recommend`、`GET /api/recommend/history`：匿名可用；history 匿名返回空列表
- `GET /api/stats`、`GET /api/ai/status`、`POST /api/ai/analyze`：匿名可用

### 淘宝同步（管理员）

`GET /api/products/sync/taobao/status`

```json
{ "available": true, "count": 13, "shops": ["喵喵毛布", "月亮制兽Moonfur", "海鲜毛布", "犬物毛布"], "updated_at": "2026-11-10T11:00:00+00:00" }
```

`POST /api/products/sync/taobao/import`

读取 `data/import/taobao-sync.json`，按 `merge` 导入并返回与 `/products/import` 相同的统计结构。文件不存在返回 404 `sync_file_missing`。
