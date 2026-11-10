#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""淘宝店铺毛布商品采集工具（登录态、小批量、人工使用）。

用途：把三家店铺里「毛布类」商品的标题、图片、价格、购买链接导出为
本系统「批量导入」可直接使用的 JSON，再由管理员补充色号。

合规提醒：
  * 本工具只读取你自己账号可见的商品公开信息，不做下单、不改库存、不绕过验证码。
  * 淘宝未登录时商品页会跳转到登录页，因此必须由你本人扫码/登录。
  * 请控制频率与数量，遵守淘宝用户协议与 robots 规则；数据仅供内部选色参考。

安装（只需一次）：
  python -m pip install playwright
  python -m playwright install chromium

使用：
  # 首次：打开浏览器，登录后按回车，登录态保存在 data/browser-profile
  python tools/collect_taobao.py --login

  # 采集三家店铺（默认全部），结果写入 data/import/
  python tools/collect_taobao.py

  # 只采一家、限制滚动次数、关闭关键词过滤
  python tools/collect_taobao.py --shop haixian --max-scroll 30 --no-filter

  # 采集完在网页「批量导入」里选择生成的 JSON 文件即可。
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PROFILE = PROJECT_ROOT / "data" / "browser-profile"
DEFAULT_OUT_DIR = PROJECT_ROOT / "data" / "import"

SHOPS: Dict[str, Dict[str, str]] = {
    "haixian": {
        "name": "海鲜毛布",
        "shop_id": "315729358",
        "url": (
            "https://shop315729358.taobao.com/category.htm"
            "?appUid=RAzN8HWamBrnswtV21MeT9k44F1wfvsSgd4aHcwPDLq7uim4csx"
            "&topIds=982613565660&shopSearchKeyword=%E6%B5%B7%E9%B2%9C%E6%AF%9B%E5%B8%83"
        ),
    },
    "quanwu": {
        "name": "犬物毛布",
        "shop_id": "439956903",
        "url": (
            "https://shop439956903.taobao.com/category.htm"
            "?appUid=RAzN8HWT7DTm2ecJNiToJVCnSCaRLpWcveEM5p7TfzsD4Fnvvkm"
            "&topIds=729942458356&shopSearchKeyword=%E7%8A%AC%E7%89%A9%E6%AF%9B%E5%B8%83"
        ),
    },
    "miaomiao": {
        "name": "喵喵毛布",
        "shop_id": "240559623",
        "url": (
            "https://shop240559623.taobao.com/category.htm"
            "?appUid=RAzN8HWZ77iYrH62n8LRx9HFP9StpaQtD4fdhD57fTdpUG8oAZS"
            "&topIds=678648447022&shopSearchKeyword=%E5%92%A9%E5%92%A9%E6%AF%9B%E5%B8%83"
        ),
    },
}

# 只保留看起来是毛布/绒类面料的商品；--no-filter 可关闭
PLUSH_KEYWORDS = [
    "毛布", "毛毯", "绒", "法兰绒", "珊瑚绒", "羊羔绒", "摇粒绒", "短毛绒",
    "长毛绒", "仿兔毛", "兔毛", "抓绒", "盖毯", "毯子", "面料", "布",
]

MATERIAL_HINTS = [
    ("珊瑚绒", "珊瑚绒"), ("法兰绒", "法兰绒"), ("羊羔绒", "羊羔绒"),
    ("摇粒绒", "摇粒绒"), ("短毛绒", "短毛绒"), ("长毛绒", "长毛绒"),
    ("仿兔毛", "仿兔毛"), ("兔毛", "仿兔毛"), ("抓绒", "摇粒绒"),
]

PRICE_RE = re.compile(r"(\d+(?:\.\d{1,2})?)")


def log(msg: str) -> None:
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", flush=True)


def parse_price(text: str) -> Optional[float]:
    if not text:
        return None
    cleaned = text.replace(",", "")
    match = PRICE_RE.search(cleaned)
    if not match:
        return None
    try:
        value = float(match.group(1))
    except ValueError:
        return None
    return value if 0 < value < 100000 else None


def guess_material(title: str) -> str:
    for hint, name in MATERIAL_HINTS:
        if hint in title:
            return name
    return "毛布"


def normalize_image(src: str) -> str:
    if not src:
        return ""
    if src.startswith("//"):
        return "https:" + src
    if src.startswith("http"):
        return src
    return ""


def item_id_from_url(url: str) -> str:
    match = re.search(r"[?&]id=(\d+)", url)
    return match.group(1) if match else ""


def extract_cards(page) -> List[Dict[str, Any]]:
    """从店铺分类页提取商品卡片；淘宝前端类名经常变化，这里用链接锚点兜底。"""
    script = r"""
    () => {
      const out = [];
      const seen = new Set();
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      for (const a of anchors) {
        const href = a.getAttribute('href') || '';
        if (!/item\.taobao\.com|detail\.tmall\.com|item\.tmall\.com/.test(href)) continue;
        let absolute = href;
        if (href.startsWith('//')) absolute = location.protocol + href;
        try { absolute = new URL(absolute, location.href).href; } catch (e) { continue; }
        if (seen.has(absolute)) continue;
        seen.add(absolute);

        let card = a;
        for (let i = 0; i < 5 && card.parentElement; i++) {
          card = card.parentElement;
          if (card.querySelector('img')) break;
        }
        const img = card.querySelector('img');
        const text = (card.innerText || '').replace(/\s+/g, ' ').trim();
        const title =
          (a.getAttribute('title') || '').trim() ||
          (img && (img.getAttribute('alt') || '').trim()) ||
          text.slice(0, 120);
        if (!title) continue;
        out.push({
          href: absolute,
          title: title,
          text: text.slice(0, 300),
          image: img ? (img.getAttribute('src') || img.getAttribute('data-src') || '') : '',
        });
      }
      return out;
    }
    """
    try:
        return page.evaluate(script)
    except Exception as exc:  # noqa: BLE001
        log(f"  页面解析失败：{exc}")
        return []


def scroll_and_collect(page, max_scroll: int) -> List[Dict[str, Any]]:
    collected: Dict[str, Dict[str, Any]] = {}
    idle = 0
    last_count = 0
    for step in range(max_scroll):
        for card in extract_cards(page):
            url = card["href"].split("&")[0]
            key = item_id_from_url(url) or url
            if key and key not in collected:
                collected[key] = card
        count = len(collected)
        log(f"  第 {step + 1} 屏：累计 {count} 件")
        if count == last_count:
            idle += 1
            if idle >= 3:
                break
        else:
            idle = 0
        last_count = count
        page.mouse.wheel(0, 2200)
        page.wait_for_timeout(1200)
    return list(collected.values())


def is_plush(title: str, text: str) -> bool:
    haystack = f"{title} {text}"
    return any(word in haystack for word in PLUSH_KEYWORDS)


def to_row(card: Dict[str, Any], shop: Dict[str, str]) -> Dict[str, Any]:
    title = re.sub(r"\s+", " ", card.get("title") or "").strip()[:180]
    price = parse_price(card.get("text") or "")
    url = (card.get("href") or "").split("&")[0]
    if url.startswith("//"):
        url = "https:" + url
    row: Dict[str, Any] = {
        "external_id": item_id_from_url(url),
        "title": title,
        "shop_name": shop["name"],
        "shop_url": shop["url"].split("?")[0],
        "product_url": url,
        "image_url": normalize_image(card.get("image") or ""),
        "price": price if price is not None else 0,
        "material": guess_material(title),
        "status": "active",
        "tags": ["淘宝采集", datetime.now().strftime("%Y-%m-%d")],
        "colors": [],
    }
    return row


def ensure_login(page, profile_dir: Path) -> None:
    """如果落到登录页，提示用户手动登录并等待。"""
    url = page.url
    if "login" not in url and "signin" not in url:
        return
    log("检测到淘宝登录页。请在弹出的浏览器中完成登录（扫码或账号密码）。")
    log("登录完成后回到本窗口按回车继续……")
    try:
        input()
    except EOFError:
        pass
    page.wait_for_timeout(1500)
    if "login" in page.url:
        log("仍未离开登录页，尝试继续（可能因风控被拦截）。")


def collect_one(context, key: str, shop: Dict[str, str], max_scroll: int, filter_plush: bool) -> List[Dict[str, Any]]:
    page = context.new_page()
    log(f"打开「{shop['name']}」：{shop['url']}")
    try:
        page.goto(shop["url"], wait_until="domcontentloaded", timeout=60000)
    except Exception as exc:  # noqa: BLE001
        log(f"  打开失败：{exc}")
        page.close()
        return []
    page.wait_for_timeout(2500)
    ensure_login(page, DEFAULT_PROFILE)
    page.wait_for_timeout(1500)

    # 部分店铺分类页需要点击「全部宝贝」才展示商品
    for label in ("全部宝贝", "所有宝贝", "毛布"):
        try:
            link = page.get_by_text(label, exact=True).first
            if link.is_visible(timeout=800):
                link.click(timeout=1500)
                page.wait_for_timeout(1800)
                break
        except Exception:  # noqa: BLE001
            continue

    cards = scroll_and_collect(page, max_scroll)
    page.close()

    rows = []
    for card in cards:
        title = card.get("title") or ""
        if filter_plush and not is_plush(title, card.get("text") or ""):
            continue
        row = to_row(card, shop)
        if row["title"]:
            rows.append(row)
    log(f"「{shop['name']}」共 {len(rows)} 件毛布商品")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser(description="淘宝店铺毛布商品采集（需本人登录）")
    parser.add_argument("--login", action="store_true", help="只打开浏览器登录并保存登录态")
    parser.add_argument("--shop", choices=list(SHOPS) + ["all"], default="all", help="采集哪家店铺")
    parser.add_argument("--max-scroll", type=int, default=40, help="每家店最多滚动屏数（默认 40）")
    parser.add_argument("--no-filter", action="store_true", help="不按毛布关键词过滤")
    parser.add_argument("--profile", default=str(DEFAULT_PROFILE), help="浏览器用户数据目录")
    parser.add_argument("--out", default="", help="输出 JSON 路径")
    parser.add_argument("--headless", action="store_true", help="无头模式（登录态已保存时可用）")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("缺少 playwright。请先执行：\n  python -m pip install playwright\n  python -m playwright install chromium")
        return 2

    profile_dir = Path(args.profile).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    keys = list(SHOPS) if args.shop == "all" else [args.shop]
    all_rows: List[Dict[str, Any]] = []

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            str(profile_dir),
            headless=args.headless,
            viewport={"width": 1360, "height": 900},
            locale="zh-CN",
            args=["--disable-blink-features=AutomationControlled"],
        )
        try:
            if args.login:
                page = context.pages[0] if context.pages else context.new_page()
                page.goto("https://login.taobao.com/member/login.jhtml", wait_until="domcontentloaded", timeout=60000)
                log("请在浏览器中完成登录，成功后回到本窗口按回车。")
                input()
                log(f"登录态已保存到：{profile_dir}")
                return 0

            for key in keys:
                shop = SHOPS[key]
                rows = collect_one(context, key, shop, args.max_scroll, not args.no_filter)
                all_rows.extend(rows)
        finally:
            context.close()

    # 去重（同一商品可能出现在多个推荐位）
    dedup: Dict[str, Dict[str, Any]] = {}
    for row in all_rows:
        dedup[row.get("external_id") or row["product_url"]] = row
    rows = list(dedup.values())
    for row in rows:
        if not row.get("external_id"):
            row.pop("external_id", None)

    out_path = Path(args.out) if args.out else DEFAULT_OUT_DIR / f"taobao-{datetime.now().strftime('%Y%m%d-%H%M%S')}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    print()
    log(f"完成：{len(rows)} 件 → {out_path}")
    log("下一步：网页进入「批量导入」选择该 JSON；采集到的商品暂无颜色，请在商品编辑里补充色号。")
    log("合规提醒：请勿高频抓取或用于商业转售，数据仅供内部选色参考。")
    return 0 if rows else 1


if __name__ == "__main__":
    sys.exit(main())
