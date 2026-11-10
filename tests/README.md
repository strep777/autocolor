# 测试脚本

> 按照项目约定，功能全部完成并通过人工验收后才执行这些测试。测试会写入并清理数据，**请使用测试库或一次性数据目录**，不要直接对生产库运行。

## 接口冒烟（41 项）

先启动后端（默认 8011）：

```bash
.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8011
```

另开终端执行：

```bash
.venv\Scripts\python.exe tests\api_smoke.py
# 自定义地址：PC_BASE=http://127.0.0.1:8000 python tests/api_smoke.py
```

覆盖范围：健康检查、未登录 401、错误密码、管理员登录/me、筛选元数据、商品创建（多色号自动计算 Lab/色系）、更新、读取、批量上架、CSV 导出（BOM）、导入模板、导入 dry-run/落库、色卡列表、色系、推荐（本地/去重/反馈/历史）、PNG 上传与静态访问、非法图片 400、用户创建/普通用户越权 403/删除、设置读写、AI 配置掩码、无 Key 时的优雅失败、公开设置、统计、商品删除。

预期输出结尾：`ALL PASS (41)`。

## Ollama 模型发现单元测试（4 项）

无需启动真实 Ollama，使用本地 HTTP 桩验证 `/api/tags` 解析、排序、404/不可达错误映射，以及模型自动推荐优先级：

```bash
.venv\Scripts\python.exe tests\test_ollama_models.py
```

预期结尾：`OK`。

## UI 与 AI 测试

浏览器端流程（Playwright + 本机 Edge）与 AI mock（DeepSeek/Ollama 两种响应、非法 JSON、超时回退）在开发机上完成，结果、截图与已知边界见 [doc/12-测试报告.md](../doc/12-测试报告.md)。浏览器测试需要：

- Node.js 20+ 与 `playwright-core`
- Microsoft Edge（脚本使用其可执行路径）
- 一个已启动的后端与可写的数据目录

AI 真实连通性需在设置页填入 DeepSeek Key，或在本机启动 Ollama 后点「保存并测试」。
