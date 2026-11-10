from __future__ import annotations

import math
import re
from dataclasses import dataclass
from typing import Dict, Iterable, List, Optional, Sequence, Tuple

HEX_RE = re.compile(r"^#?([0-9a-fA-F]{6})$")

# D65 / 2°
XN, YN, ZN = 0.95047, 1.0, 1.08883


class ColorError(ValueError):
    pass


@dataclass(frozen=True)
class ColorInfo:
    hex: str
    r: int
    g: int
    b: int
    l: float
    a: float
    bb: float
    family: str
    text_color: str

    def to_dict(self) -> Dict[str, object]:
        return {
            "hex": self.hex,
            "rgb": {"r": self.r, "g": self.g, "b": self.b},
            "hsl": rgb_to_hsl_dict(self.r, self.g, self.b),
            "lab": {"l": round(self.l, 2), "a": round(self.a, 2), "b": round(self.bb, 2)},
            "family": self.family,
            "text_color": self.text_color,
        }


def normalize_hex(value: str) -> str:
    if not isinstance(value, str):
        raise ColorError("色值必须是字符串")
    m = HEX_RE.match(value.strip())
    if not m:
        raise ColorError(f"无效的 HEX 色值：{value}")
    return "#" + m.group(1).upper()


def hex_to_rgb(value: str) -> Tuple[int, int, int]:
    h = normalize_hex(value)
    return int(h[1:3], 16), int(h[3:5], 16), int(h[5:7], 16)


def rgb_to_hex(r: int, g: int, b: int) -> str:
    return "#{:02X}{:02X}{:02X}".format(
        max(0, min(255, int(round(r)))),
        max(0, min(255, int(round(g)))),
        max(0, min(255, int(round(b)))),
    )


def rgb_to_hsl(r: int, g: int, b: int) -> Tuple[float, float, float]:
    r1, g1, b1 = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r1, g1, b1), min(r1, g1, b1)
    lightness = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, round(lightness * 100, 1)
    d = mx - mn
    sat = d / (2 - mx - mn) if lightness > 0.5 else d / (mx + mn)
    if mx == r1:
        hue = ((g1 - b1) / d) % 6
    elif mx == g1:
        hue = (b1 - r1) / d + 2
    else:
        hue = (r1 - g1) / d + 4
    return round(hue * 60, 1), round(sat * 100, 1), round(lightness * 100, 1)


def rgb_to_hsl_dict(r: int, g: int, b: int) -> Dict[str, float]:
    h, s, l = rgb_to_hsl(r, g, b)
    return {"h": h, "s": s, "l": l}


def _srgb_linear(channel: int) -> float:
    c = channel / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _f(t: float) -> float:
    return t ** (1.0 / 3.0) if t > 0.008856 else (7.787 * t + 16.0 / 116.0)


def rgb_to_lab(r: int, g: int, b: int) -> Tuple[float, float, float]:
    rl, gl, bl = _srgb_linear(r), _srgb_linear(g), _srgb_linear(b)
    x = (0.4124564 * rl + 0.3575761 * gl + 0.1804375 * bl) / XN
    y = (0.2126729 * rl + 0.7151522 * gl + 0.0721750 * bl) / YN
    z = (0.0193339 * rl + 0.1191920 * gl + 0.9503041 * bl) / ZN
    fx, fy, fz = _f(x), _f(y), _f(z)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def hex_to_lab(value: str) -> Tuple[float, float, float]:
    return rgb_to_lab(*hex_to_rgb(value))


def relative_luminance(r: int, g: int, b: int) -> float:
    def lin(c: int) -> float:
        c1 = c / 255.0
        return c1 / 12.92 if c1 <= 0.03928 else ((c1 + 0.055) / 1.055) ** 2.4

    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def best_text_color(r: int, g: int, b: int) -> str:
    return "#1D1D1F" if relative_luminance(r, g, b) > 0.45 else "#FFFFFF"


def _hue_deg(l: float, a: float, b: float) -> float:
    if abs(a) < 1e-6 and abs(b) < 1e-6:
        return 0.0
    h = math.degrees(math.atan2(b, a))
    return h + 360 if h < 0 else h


def color_family(hex_value: str) -> str:
    """把颜色归入 13 个中文色系，用于筛选与色卡分组。

    以 HSL 色相/饱和度/明度判断，比 Lab 色相更贴近人对布料颜色的直觉；
    低饱和优先归入白/米/灰/黑，避免暖灰被误判成橙黄。
    """
    r, g, b = hex_to_rgb(hex_value)
    hue, sat, light = rgb_to_hsl(r, g, b)

    # 无彩色与近中性色
    if sat < 8:
        if light >= 94:
            return "白"
        if light <= 18:
            return "黑"
        if light >= 85 and 30 <= hue <= 80:
            return "米"
        return "灰"

    # 浅暖色（奶油、燕麦、象牙）归米色，而不是橙色
    if light >= 78 and 20 <= hue <= 60 and sat < 60:
        return "米"
    if light >= 94 and sat < 12:
        return "白"
    if sat < 15 and light >= 82:
        return "米"

    # 深暖色（咖啡、驼色、焦糖）归棕色
    if 15 <= hue < 50 and light < 75 and sat < 40:
        return "棕"
    if 15 <= hue < 50 and light < 45 and sat < 65:
        return "棕"

    if hue < 10 or hue >= 345:
        if sat < 35 and light > 55:
            return "粉"
        return "粉" if (light > 72 and sat < 55) else "红"
    if hue < 45:
        return "橙"
    if hue < 68:
        return "黄" if light >= 55 else "棕"
    if hue < 165:
        return "绿"
    if hue < 200:
        return "青"
    if hue < 250:
        return "蓝"
    if hue < 300:
        return "紫"
    if hue < 345:
        return "粉"
    return "红"


def describe(value: str) -> ColorInfo:
    h = normalize_hex(value)
    r, g, b = hex_to_rgb(h)
    l, a, bb = rgb_to_lab(r, g, b)
    return ColorInfo(
        hex=h,
        r=r,
        g=g,
        b=b,
        l=l,
        a=a,
        bb=bb,
        family=color_family(h),
        text_color=best_text_color(r, g, b),
    )


# --------------------------------------------------------------------------
# CIEDE2000
# --------------------------------------------------------------------------

def delta_e_2000(lab1: Sequence[float], lab2: Sequence[float]) -> float:
    """CIEDE2000 色差，kL=kC=kH=1。返回 0~100 量级。"""
    l1, a1, b1 = float(lab1[0]), float(lab1[1]), float(lab1[2])
    l2, a2, b2 = float(lab2[0]), float(lab2[1]), float(lab2[2])

    c1 = math.hypot(a1, b1)
    c2 = math.hypot(a2, b2)
    c_bar = (c1 + c2) / 2.0
    c_bar7 = c_bar ** 7
    g = 0.5 * (1 - math.sqrt(c_bar7 / (c_bar7 + 25.0 ** 7))) if c_bar > 0 else 0.0

    a1p = (1 + g) * a1
    a2p = (1 + g) * a2
    c1p = math.hypot(a1p, b1)
    c2p = math.hypot(a2p, b2)

    def hp(ap: float, bp: float) -> float:
        if abs(ap) < 1e-9 and abs(bp) < 1e-9:
            return 0.0
        h = math.degrees(math.atan2(bp, ap))
        return h + 360 if h < 0 else h

    h1p = hp(a1p, b1)
    h2p = hp(a2p, b2)

    dlp = l2 - l1
    dcp = c2p - c1p

    if c1p * c2p == 0:
        dhp = 0.0
    else:
        diff = h2p - h1p
        if abs(diff) <= 180:
            dhp = diff
        elif diff > 180:
            dhp = diff - 360
        else:
            dhp = diff + 360

    dhp_rad = math.radians(dhp / 2.0)
    dh_big = 2 * math.sqrt(c1p * c2p) * math.sin(dhp_rad)

    l_bar = (l1 + l2) / 2.0
    c_barp = (c1p + c2p) / 2.0

    if c1p * c2p == 0:
        h_bar = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        h_bar = (h1p + h2p) / 2.0
    elif h1p + h2p < 360:
        h_bar = (h1p + h2p + 360) / 2.0
    else:
        h_bar = (h1p + h2p - 360) / 2.0

    t = (
        1
        - 0.17 * math.cos(math.radians(h_bar - 30))
        + 0.24 * math.cos(math.radians(2 * h_bar))
        + 0.32 * math.cos(math.radians(3 * h_bar + 6))
        - 0.20 * math.cos(math.radians(4 * h_bar - 63))
    )
    d_theta = 30 * math.exp(-(((h_bar - 275) / 25.0) ** 2))
    c_barp7 = c_barp ** 7
    rc = 2 * math.sqrt(c_barp7 / (c_barp7 + 25.0 ** 7)) if c_barp > 0 else 0.0
    sl = 1 + (0.015 * (l_bar - 50) ** 2) / math.sqrt(20 + (l_bar - 50) ** 2)
    sc = 1 + 0.045 * c_barp
    sh = 1 + 0.015 * c_barp * t
    rt = -math.sin(math.radians(2 * d_theta)) * rc

    term_l = dlp / sl
    term_c = dcp / sc
    term_h = dh_big / sh
    return math.sqrt(term_l ** 2 + term_c ** 2 + term_h ** 2 + rt * term_c * term_h)


def delta_e_hex(hex1: str, hex2: str) -> float:
    return delta_e_2000(hex_to_lab(hex1), hex_to_lab(hex2))


def similarity_score(delta_e: float) -> float:
    """ΔE → 0~100 相似度，18 为尺度参数：ΔE=3.5→96，12→64，25→15。"""
    return round(100 * math.exp(-((max(0.0, delta_e) / 18.0) ** 2)), 1)


def match_level(delta_e: float) -> str:
    if delta_e <= 3.5:
        return "close"
    if delta_e <= 12:
        return "similar"
    return "inspiration"


LEVEL_LABELS = {"close": "几乎一致", "similar": "相近", "inspiration": "灵感"}


def rgb_from_hsl(h: float, s: float, l: float) -> Tuple[int, int, int]:
    """h: 0-360, s/l: 0-100。用于前端/后端色板生成。"""
    h = h % 360
    s = max(0.0, min(100.0, s)) / 100.0
    l = max(0.0, min(100.0, l)) / 100.0
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = l - c / 2
    if h < 60:
        rp, gp, bp = c, x, 0
    elif h < 120:
        rp, gp, bp = x, c, 0
    elif h < 180:
        rp, gp, bp = 0, c, x
    elif h < 240:
        rp, gp, bp = 0, x, c
    elif h < 300:
        rp, gp, bp = x, 0, c
    else:
        rp, gp, bp = c, 0, x
    return (
        int(round((rp + m) * 255)),
        int(round((gp + m) * 255)),
        int(round((bp + m) * 255)),
    )


def nearest_known_color(value: str, palette: Iterable[str]) -> Optional[str]:
    target = hex_to_lab(value)
    best: Optional[Tuple[float, str]] = None
    for item in palette:
        d = delta_e_2000(target, hex_to_lab(item))
        if best is None or d < best[0]:
            best = (d, item)
    return best[1] if best else None


def sort_by_distance(target_lab: Sequence[float], colors: List[dict]) -> List[dict]:
    """colors 每项需含 lab_l/lab_a/lab_b 或 lab 列表；返回附加 distance/score 的新列表。"""
    out = []
    for c in colors:
        if "lab" in c:
            lab = c["lab"]
        else:
            lab = (c.get("lab_l", 0), c.get("lab_a", 0), c.get("lab_b", 0))
        d = delta_e_2000(target_lab, lab)
        item = dict(c)
        item["distance"] = round(d, 2)
        item["score"] = similarity_score(d)
        item["level"] = match_level(d)
        out.append(item)
    out.sort(key=lambda x: x["distance"])
    return out
