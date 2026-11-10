"""接口冒烟测试：覆盖认证、商品/色号 CRUD、批量、导入导出、推荐、上传、用户与设置。

用法：先启动后端，再在仓库根目录运行
    .venv\\Scripts\\python.exe tests\\api_smoke.py
默认目标 http://127.0.0.1:8011，可用环境变量 PC_BASE 覆盖。
脚本会创建并删除测试商品/用户，请勿对生产库运行。
"""
import base64
import json
import os
import sys
import uuid

import httpx

BASE = os.environ.get("PC_BASE", "http://127.0.0.1:8011")
ok = 0
failed = []


def check(name, cond, extra=""):
    global ok
    if cond:
        ok += 1
        print(f"  ok  {name}")
    else:
        failed.append(name)
        print(f"FAIL  {name} {extra}")


def main():
    c = httpx.Client(base_url=BASE, timeout=30, trust_env=False)

    r = c.get("/api/health")
    check("health", r.status_code == 200 and r.json()["status"] == "ok", r.text[:200])

    r = c.get("/api/products")
    check("unauth products public", r.status_code == 200 and "items" in r.json(), r.text[:200])

    r = c.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    check("wrong password 401", r.status_code == 401, r.text[:200])

    r = c.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    check("login admin", r.status_code == 200 and r.json()["permissions"]["can_manage"], r.text[:200])

    me = c.get("/api/auth/me")
    check("auth me", me.status_code == 200 and me.json()["user"]["username"] == "admin", me.text[:200])

    f = c.get("/api/products/filters")
    check("filters", f.status_code == 200 and len(f.json()["shops"]) >= 4, f.text[:200])

    suffix = uuid.uuid4().hex[:6]
    payload = {
        "title": f"接口测试毛布 {suffix}",
        "shop_name": "海鲜毛布",
        "shop_url": "https://shop315729358.taobao.com/",
        "product_url": "https://shop315729358.taobao.com/",
        "image_url": "",
        "price_cents": 3990,
        "material": "珊瑚绒",
        "width_cm": 150,
        "weight_gsm": 320,
        "description": "冒烟测试商品",
        "tags": ["测试"],
        "status": "active",
        "colors": [
            {"name": "测试蓝", "hex": "#6C8EBF", "is_primary": True},
            {"name": "测试灰", "hex": "#8A8A8E", "is_primary": False},
        ],
    }
    r = c.post("/api/products", json=payload)
    check("create product", r.status_code == 200 and r.json()["product"]["id"], r.text[:300])
    product = r.json()["product"] if r.status_code == 200 else {}
    pid = product.get("id")
    colors = product.get("colors") or []
    check("product colors lab", len(colors) == 2 and colors[0]["family"] == "蓝" and colors[0]["lab"]["l"] > 0, str(colors))

    r = c.put(f"/api/products/{pid}", json={"title": payload["title"] + " 改", "status": "draft"})
    check("update product", r.status_code == 200 and r.json()["product"]["status"] == "draft", r.text[:300])

    r = c.get(f"/api/products/{pid}")
    check("get product", r.status_code == 200 and r.json()["product"]["title"].endswith("改"), r.text[:200])

    r = c.post("/api/products/bulk", json={"action": "activate", "ids": [pid]})
    check("bulk activate", r.status_code == 200 and r.json()["affected"] == 1, r.text[:200])

    r = c.get("/api/products/export?format=csv")
    check("export csv", r.status_code == 200 and "\ufeff" in r.text and "title" in r.text, r.text[:100])

    r = c.get("/api/products/import/template")
    check("import template", r.status_code == 200 and "json" in r.json() and "colors" in r.json()["json"], r.text[:100])

    imp = {
        "content": json.dumps(
            [
                {
                    "title": f"导入测试 A {suffix}",
                    "shop_name": "犬物毛布",
                    "price": 45.5,
                    "colors": "奶白:#F3E9D2|雾蓝:#9FB0BF",
                    "material": "法兰绒",
                    "status": "active",
                },
                {"title": "", "price": -1},
            ],
            ensure_ascii=False,
        ),
        "format": "json",
        "mode": "merge",
        "dry_run": True,
    }
    r = c.post("/api/products/import", json=imp)
    check(
        "import dry run",
        r.status_code == 200
        and r.json()["created"] == 1
        and r.json()["preview"][0].get("action") == "create"
        and len(r.json()["preview"]) == 1
        and r.json()["error_count"] >= 1,
        r.text[:400],
    )

    imp["dry_run"] = False
    r = c.post("/api/products/import", json=imp)
    check("import real", r.status_code == 200 and r.json()["created"] == 1, r.text[:300])

    r = c.get("/api/colors?page=1&page_size=5")
    check("colors list", r.status_code == 200 and len(r.json()["items"]) == 5, r.text[:200])
    r = c.get("/api/colors/families")
    check("colors families", r.status_code == 200 and len(r.json()["items"]) >= 5, r.text[:300])

    r = c.post("/api/recommend", json={"hex": "#6C8EBF", "mode": "local", "limit": 6})
    rec = r.json() if r.status_code == 200 else {}
    check("recommend local", r.status_code == 200 and rec.get("mode") == "local" and len(rec.get("items", [])) > 0, r.text[:300])
    check("recommend dedupe products", len({i["product_id"] for i in rec.get("items", [])}) == len(rec.get("items", [])), "")
    if rec.get("log_id"):
        r = c.post(f"/api/recommend/{rec['log_id']}/feedback", json={"value": 1})
        check("recommend feedback", r.status_code == 200, r.text[:200])

    r = c.get("/api/recommend/history?limit=5")
    check("recommend history", r.status_code == 200 and len(r.json()["items"]) >= 1, r.text[:200])

    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    )
    r = c.post("/api/uploads/images", files={"file": ("tiny.png", png, "image/png")})
    up = r.json() if r.status_code == 200 else {}
    check("upload png", r.status_code == 200 and up.get("url", "").startswith("/uploads/"), r.text[:300])
    if up.get("original_url"):
        r = c.get(up["original_url"])
        check("serve original upload", r.status_code == 200 and len(r.content) == len(png), str(r.status_code))

    big = png + os.urandom(12 * 1024 * 1024 - len(png))
    r = c.post("/api/uploads/sessions", json={"filename": "12mb.png", "size": len(big), "content_type": "image/png"})
    sess = r.json() if r.status_code == 200 else {}
    check("chunk session", r.status_code == 200 and sess.get("upload_id"), r.text[:300])
    if sess.get("upload_id"):
        r = c.put(
            f"/api/uploads/sessions/{sess['upload_id']}?offset=0",
            content=big,
            headers={"Content-Type": "application/octet-stream"},
        )
        check("chunk put 12mb", r.status_code == 200 and r.json().get("offset") == len(big), r.text[:300])
        r = c.post(f"/api/uploads/sessions/{sess['upload_id']}/complete")
        done = r.json() if r.status_code == 200 else {}
        check("chunk complete 12mb", r.status_code == 200 and done.get("size") == len(big), r.text[:300])

    r = c.post("/api/uploads/sessions", json={"filename": "50gb.jpg", "size": 50 * 1024**3, "content_type": "image/jpeg"})
    huge = r.json() if r.status_code == 200 else {}
    check("accept 50gb session", r.status_code == 200 and huge.get("size") == 50 * 1024**3, r.text[:300])
    if huge.get("upload_id"):
        c.delete(f"/api/uploads/sessions/{huge['upload_id']}")

    r = c.post("/api/uploads/images", files={"file": ("bad.txt", b"not an image", "text/plain")})
    check("upload rejects non-image", r.status_code == 400, r.text[:200])

    r = c.post("/api/users", json={"username": f"tester_{suffix}", "display_name": "测试成员", "password": "Test1234", "role": "user"})
    check("create user", r.status_code == 200 and r.json()["user"]["id"], r.text[:300])
    tester = r.json()["user"] if r.status_code == 200 else {}
    tid = tester.get("id")

    if tid:
        u = httpx.Client(base_url=BASE, timeout=30, trust_env=False)
        r = u.post("/api/auth/login", json={"username": f"tester_{suffix}", "password": "Test1234"})
        check("user login", r.status_code == 200, r.text[:200])
        r = u.post("/api/products", json={"title": "越权", "colors": [{"hex": "#FFFFFF"}]})
        check("user cannot create", r.status_code == 403, r.text[:200])
        r = u.get("/api/products")
        check("user can read", r.status_code == 200, r.text[:200])
        r = c.delete(f"/api/users/{tid}")
        check("delete user", r.status_code == 200, r.text[:200])

    r = c.get("/api/settings")
    cfg = r.json()["values"] if r.status_code == 200 else {}
    check("settings get", r.status_code == 200 and "ai.provider" in cfg, r.text[:300])
    r = c.put("/api/settings", json={"values": {"appearance.theme": "system"}})
    check("settings put", r.status_code == 200, r.text[:300])

    r = c.get("/api/ai/config")
    check("ai config masked", r.status_code == 200 and "deepseek_api_key" in r.text, r.text[:200])
    r = c.post("/api/ai/test", json={"provider": "deepseek"})
    check("ai test graceful", r.status_code == 200 and r.json()["ok"] is False, r.text[:300])

    r = c.get("/api/settings/public")
    check("settings public", r.status_code == 200 and "app.name" in r.json(), r.text[:200])
    r = c.get("/api/stats")
    check("stats", r.status_code == 200 and r.json()["products"]["total"] >= 1, r.text[:200])

    r = c.delete(f"/api/products/{pid}")
    check("delete product", r.status_code == 200, r.text[:200])

    r = c.post("/api/products/bulk", json={"action": "delete", "all": True, "filters": {"q": suffix}})
    check("cleanup test products", r.status_code == 200, r.text[:200])

    print(f"\n通过 {ok} 项，失败 {len(failed)} 项：{failed}")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
