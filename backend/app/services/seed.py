from __future__ import annotations

import html
import json
from pathlib import Path
from typing import Any, Dict, List

from sqlalchemy.orm import Session

from ..config import settings
from ..core.security import hash_password
from ..models import Product, User
from ..schemas import ColorIn, ProductIn
from . import products as product_service
from . import settings as settings_service

SHOPS = {
    "海鲜毛布": "https://shop315729358.taobao.com/",
    "犬物毛布": "https://shop439956903.taobao.com/",
    "喵喵毛布": "https://shop240559623.taobao.com/",
}

SEED_PRODUCTS: List[Dict[str, Any]] = [
    {
        "title": "加厚珊瑚绒 奶油白", "shop": "海鲜毛布", "price": 3990, "material": "珊瑚绒",
        "width": 160, "weight": 320, "tags": ["纯色", "加厚", "亲肤"],
        "desc": "双面珊瑚绒，绒毛细腻不掉毛，适合做毯子、宠物窝内衬。",
        "colors": [("奶油白", "#F3E9D2"), ("象牙白", "#EDE4CF")],
    },
    {
        "title": "双面珊瑚绒 雾霾蓝", "shop": "海鲜毛布", "price": 4500, "material": "珊瑚绒",
        "width": 160, "weight": 340, "tags": ["纯色", "秋冬"],
        "desc": "低饱和雾霾蓝，冷调柔和，适合北欧风家居与猫窝。",
        "colors": [("雾霾蓝", "#9FB0BF"), ("浅雾蓝", "#B7C6D2")],
    },
    {
        "title": "法兰绒床品布 燕麦米", "shop": "海鲜毛布", "price": 5900, "material": "法兰绒",
        "width": 180, "weight": 280, "tags": ["纯色", "床品"],
        "desc": "细密短绒，手感柔软，适合床单、被套与沙发盖毯。",
        "colors": [("燕麦米", "#E6D8BF"), ("浅卡其", "#D8C7A9")],
    },
    {
        "title": "羊羔绒毯 云朵灰", "shop": "海鲜毛布", "price": 6900, "material": "羊羔绒",
        "width": 150, "weight": 420, "tags": ["加厚", "保暖"],
        "desc": "颗粒感羊羔绒，蓬松保暖，秋冬盖毯与窝垫首选。",
        "colors": [("云朵灰", "#C9C9CE"), ("浅烟灰", "#DADADE")],
    },
    {
        "title": "短毛绒抱枕布 焦糖棕", "shop": "海鲜毛布", "price": 2990, "material": "短毛绒",
        "width": 150, "weight": 300, "tags": ["纯色", "抱枕"],
        "desc": "短密绒毛，耐磨易打理，适合抱枕、坐垫与汽车靠垫。",
        "colors": [("焦糖棕", "#A9714B"), ("深棕", "#8B5A2B")],
    },
    {
        "title": "珊瑚绒 豆沙粉", "shop": "海鲜毛布", "price": 4200, "material": "珊瑚绒",
        "width": 160, "weight": 330, "tags": ["纯色", "温柔"],
        "desc": "低饱和豆沙粉，显白不甜腻，适合少女房与宠物小窝。",
        "colors": [("豆沙粉", "#D9A6A0"), ("灰粉", "#C98F8C")],
    },
    {
        "title": "法兰绒 鼠尾草绿", "shop": "海鲜毛布", "price": 5500, "material": "法兰绒",
        "width": 180, "weight": 300, "tags": ["纯色", "治愈"],
        "desc": "带灰调的鼠尾草绿，安静耐看，适合日式与侘寂风。",
        "colors": [("鼠尾草绿", "#A8B5A0"), ("深鼠尾草", "#8E9C86")],
    },
    {
        "title": "羊羔绒 雾紫", "shop": "海鲜毛布", "price": 7200, "material": "羊羔绒",
        "width": 150, "weight": 430, "tags": ["加厚", "轻奢"],
        "desc": "灰调雾紫，光泽柔和，适合飘窗垫与轻奢风盖毯。",
        "colors": [("雾紫", "#B9A7C9"), ("灰紫", "#A18FB3")],
    },
    {
        "title": "犬用垫布 短毛绒 卡其", "shop": "犬物毛布", "price": 3500, "material": "短毛绒",
        "width": 150, "weight": 360, "tags": ["宠物", "耐脏"],
        "desc": "耐磨短毛绒，抗抓耐脏，适合中型犬窝垫。",
        "colors": [("卡其", "#C9B79C"), ("深卡其", "#B7A183")],
    },
    {
        "title": "宠物窝面料 摇粒绒 藏青", "shop": "犬物毛布", "price": 3800, "material": "摇粒绒",
        "width": 150, "weight": 300, "tags": ["宠物", "基础款"],
        "desc": "摇粒绒轻暖易洗，藏青耐脏，适合狗窝外罩与内衬。",
        "colors": [("藏青", "#2F3E5B"), ("深蓝", "#3D4E6E")],
    },
    {
        "title": "狗窝绒布 羊羔绒 奶咖", "shop": "犬物毛布", "price": 4800, "material": "羊羔绒",
        "width": 160, "weight": 400, "tags": ["宠物", "保暖"],
        "desc": "奶咖羊羔绒，柔软蓬松，冬季狗窝包边与垫面皆宜。",
        "colors": [("奶咖", "#D8C3A5"), ("浅驼", "#C6AE8C")],
    },
    {
        "title": "耐咬短毛绒 砖红", "shop": "犬物毛布", "price": 3200, "material": "短毛绒",
        "width": 150, "weight": 380, "tags": ["宠物", "耐咬"],
        "desc": "高密度短毛绒，抗撕裂，砖红活力耐脏。",
        "colors": [("砖红", "#B4574E"), ("深砖红", "#9C463F")],
    },
    {
        "title": "宠物毯 珊瑚绒 浅灰", "shop": "犬物毛布", "price": 3600, "material": "珊瑚绒",
        "width": 150, "weight": 320, "tags": ["宠物", "百搭"],
        "desc": "轻软珊瑚绒小毯，机洗不变形，出行与居家都方便。",
        "colors": [("浅灰", "#D5D5D8"), ("中灰", "#C2C2C6")],
    },
    {
        "title": "摇粒绒 军绿", "shop": "犬物毛布", "price": 3300, "material": "摇粒绒",
        "width": 150, "weight": 290, "tags": ["户外", "耐脏"],
        "desc": "军绿摇粒绒，耐磨抗起球，适合户外宠物垫与训练毯。",
        "colors": [("军绿", "#5E6B4F"), ("深军绿", "#4C5740")],
    },
    {
        "title": "仿兔毛 雪白", "shop": "犬物毛布", "price": 5800, "material": "仿兔毛",
        "width": 160, "weight": 450, "tags": ["长毛", "柔软"],
        "desc": "仿兔毛长绒，顺滑蓬松，适合高端宠物窝与拍照道具。",
        "colors": [("雪白", "#F7F4EE"), ("米白", "#EDE8DF")],
    },
    {
        "title": "犬物垫布 姜黄", "shop": "犬物毛布", "price": 4100, "material": "短毛绒",
        "width": 150, "weight": 350, "tags": ["亮色", "宠物"],
        "desc": "姜黄短毛绒，提亮空间，适合活泼小型犬。",
        "colors": [("姜黄", "#D9A441"), ("深姜黄", "#C08E32")],
    },
    {
        "title": "猫窝绒布 仿兔毛 奶茶", "shop": "喵喵毛布", "price": 5200, "material": "仿兔毛",
        "width": 150, "weight": 460, "tags": ["猫窝", "长毛"],
        "desc": "奶茶色仿兔毛，柔软包裹感强，做猫窝内衬最合适。",
        "colors": [("奶茶", "#CBB39A"), ("浅奶茶", "#B99F84")],
    },
    {
        "title": "猫毯 长毛绒 樱花粉", "shop": "喵喵毛布", "price": 4600, "material": "长毛绒",
        "width": 150, "weight": 400, "tags": ["猫毯", "温柔"],
        "desc": "樱花粉长毛绒，轻盈亲肤，猫咪踩奶神器。",
        "colors": [("樱花粉", "#E8C4C8"), ("浅樱粉", "#D9AEB4")],
    },
    {
        "title": "短毛绒 雾霾蓝灰", "shop": "喵喵毛布", "price": 3900, "material": "短毛绒",
        "width": 150, "weight": 340, "tags": ["纯色", "耐脏"],
        "desc": "蓝灰短毛绒，冷静耐看，猫抓板包布与窝垫都适合。",
        "colors": [("雾霾蓝灰", "#8FA3AD"), ("深蓝灰", "#7D9099")],
    },
    {
        "title": "羊羔绒 香芋紫", "shop": "喵喵毛布", "price": 4900, "material": "羊羔绒",
        "width": 150, "weight": 420, "tags": ["加厚", "少女"],
        "desc": "香芋紫羊羔绒，蓬松保暖，冬季猫窝的温柔底色。",
        "colors": [("香芋紫", "#C3B2D4"), ("灰香芋", "#AD9BC0")],
    },
    {
        "title": "珊瑚绒 柠檬黄", "shop": "喵喵毛布", "price": 3700, "material": "珊瑚绒",
        "width": 150, "weight": 330, "tags": ["亮色", "活力"],
        "desc": "明亮柠檬黄珊瑚绒，提亮空间，适合拍照与年轻客群。",
        "colors": [("柠檬黄", "#E8D06A"), ("暖黄", "#D4BA52")],
    },
    {
        "title": "长毛绒 墨绿", "shop": "喵喵毛布", "price": 5600, "material": "长毛绒",
        "width": 160, "weight": 480, "tags": ["复古", "长毛"],
        "desc": "墨绿长毛绒，复古高级，适合复古风猫窝与飘窗垫。",
        "colors": [("墨绿", "#3E5748"), ("深墨绿", "#324839")],
    },
    {
        "title": "法兰绒 酒红", "shop": "喵喵毛布", "price": 4400, "material": "法兰绒",
        "width": 160, "weight": 300, "tags": ["复古", "节日"],
        "desc": "酒红法兰绒，显色饱满，节日礼盒与圣诞猫窝首选。",
        "colors": [("酒红", "#7E2F3A"), ("深酒红", "#6A2731")],
    },
    {
        "title": "仿兔毛 黑白花", "shop": "喵喵毛布", "price": 6200, "material": "仿兔毛",
        "width": 160, "weight": 470, "tags": ["拼色", "高级"],
        "desc": "黑白双色仿兔毛，做奶牛纹拼色猫窝与时尚宠物服饰。",
        "colors": [("墨黑", "#3A3A3C"), ("本白", "#EFEDE8")],
    },
]


def _svg_for(index: int, colors: List[str]) -> str:
    c1 = colors[0]
    c2 = colors[1] if len(colors) > 1 else colors[0]
    c3 = colors[2] if len(colors) > 2 else c1
    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{c1}"/>
      <stop offset="0.55" stop-color="{c2}"/>
      <stop offset="1" stop-color="{c1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.35" cy="0.3" r="0.7">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0.45"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
    <filter id="noise">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" stitchTiles="stitch"/>
      <feColorMatrix type="saturate" values="0"/>
    </filter>
  </defs>
  <rect width="800" height="600" fill="url(#bg)"/>
  <circle cx="210" cy="210" r="230" fill="{c3}" opacity="0.35"/>
  <circle cx="620" cy="430" r="200" fill="#FFFFFF" opacity="0.10"/>
  <rect width="800" height="600" filter="url(#noise)" opacity="0.10" style="mix-blend-mode:overlay"/>
  <rect width="800" height="600" fill="url(#glow)"/>
  <rect x="0" y="520" width="800" height="80" fill="#000000" opacity="0.06"/>
</svg>
"""


def ensure_seed_image(index: int, colors: List[str]) -> str:
    path = settings.seed_image_path / f"p{index:02d}.svg"
    if not path.exists():
        path.write_text(_svg_for(index, colors), encoding="utf-8")
    return f"/uploads/seed/p{index:02d}.svg"


def _ensure_user(db: Session, username: str, password: str, role: str, display_name: str) -> None:
    if db.query(User).filter(User.username == username).first():
        return
    db.add(
        User(
            username=username,
            password_hash=hash_password(password),
            display_name=display_name,
            role=role,
            is_active=True,
        )
    )
    db.commit()


def seed(db: Session) -> None:
    _ensure_user(db, settings.admin_username, settings.admin_password, "admin", "管理员")

    if not settings.seed_demo:
        return

    existing = db.query(Product).count()
    if existing > 0:
        # 已有真实商品时只确保管理员存在，不再补示例数据。
        settings_service.set_value(db, "app.demo_seeded", True)
        db.commit()
        return
    if settings_service.get_value(db, "app.demo_seeded", False):
        return

    for index, item in enumerate(SEED_PRODUCTS, start=1):
        color_hexes = [hex_value for _, hex_value in item["colors"]]
        image = ensure_seed_image(index, color_hexes)
        payload = ProductIn(
            title=item["title"],
            shop_name=item["shop"],
            shop_url=SHOPS[item["shop"]],
            product_url=SHOPS[item["shop"]],
            image_url=image,
            price_cents=item["price"],
            material=item["material"],
            width_cm=item["width"],
            weight_gsm=item["weight"],
            description=item["desc"],
            tags=list(item["tags"]) + ["示例"],
            status="active",
            colors=[
                ColorIn(name=name, hex=hex_value, is_primary=(i == 0))
                for i, (name, hex_value) in enumerate(item["colors"])
            ],
        )
        product_service.create_product(db, payload, None, source="demo")
    db.commit()
    settings_service.set_value(db, "app.demo_seeded", True)
    db.commit()


def reset_demo(db: Session) -> int:
    rows = db.query(Product).filter(Product.source == "demo").all()
    count = len(rows)
    for row in rows:
        db.delete(row)
    db.commit()
    return count
