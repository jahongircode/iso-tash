#!/usr/bin/env python3
"""
Генератор изометрических пиксельных спрайтов достопримечательностей Ташкента.

Запуск:  python tools/gen_sprites.py     (нужен Pillow: pip install pillow)
Результат: assets/sprites/<id>.png + js/sprites-meta.js

Каждый PNG — лист 2x2:
  ряд 0  — дневная картинка, кадры 0 и 1 (простая цикличная анимация);
  ряд 1  — «светящийся» слой (окна, фонари), рисуется поверх ночного затемнения.

Проекция: изометрия 2:1, ось u = юг (вниз-вправо), v = запад (вниз-влево), z = вверх.
Она совпадает с поворотом карты в js/engine.js, поэтому спрайты стоят «в одном ракурсе» с городом.
1 единица спрайта ≈ 3 метра (UNIT_M в метаданных).

Любой спрайт можно заменить своей картинкой (например, сгенерированной нейросетью) —
см. раздел «Как заменить картинки» в INFO.txt.
"""
import json, math, os, random
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "assets", "sprites")
UNIT_M = 3.0

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]

# ---------- палитра (землистая, как в референсах) ----------
GRASS = (88, 124, 60); GRASS2 = (106, 142, 68); GRASS3 = (72, 104, 52)
PATH = (194, 176, 140); PAVE = (170, 160, 146); PAVE2 = (152, 143, 130)
STONE = (212, 204, 188); WHITE = (234, 230, 220); MARBLE = (240, 238, 232)
SAND = (204, 168, 116); SAND2 = (186, 148, 98); BRICK = (172, 108, 72); BRICK2 = (146, 88, 58)
TURQ = (46, 168, 188); BLUE = (46, 92, 168); DBLUE = (28, 56, 116); SKY = (110, 170, 214)
GOLD = (226, 184, 72); BRONZE = (104, 76, 50); BRONZE2 = (140, 104, 66)
WATER = (56, 104, 146); WATER2 = (92, 150, 192)
ROOF = (118, 106, 96); GLASS = (78, 128, 158); GLASS2 = (120, 168, 190)
DARK = (46, 42, 40); RED = (196, 60, 48); TRUNK = (92, 66, 44)
LIT = (255, 214, 120, 255); LIT2 = (255, 180, 90, 255)


def mul(c, k):
    return tuple(max(0, min(255, int(x * k))) for x in c[:3])


def mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


class Spr:
    def __init__(self, frame, seed=1):
        self.W, self.H = 420, 460
        self.ox, self.oy = 210, 330
        self.img = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.em = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.sh = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.d = ImageDraw.Draw(self.img)
        self.de = ImageDraw.Draw(self.em)
        self.ds = ImageDraw.Draw(self.sh)
        self.f = frame
        self.rnd = random.Random(seed)

    # --- проекция ---
    def P(self, u, v, z=0):
        return (self.ox + (u - v), self.oy + (u + v) / 2.0 - z)

    def px(self, x, y, c, layer=None):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.W and 0 <= y < self.H:
            (layer or self.img).putpixel((x, y), c if len(c) == 4 else c + (255,))

    def poly(self, pts, c):
        self.d.polygon([self.P(*p) for p in pts], fill=c if len(c) == 4 else c + (255,))

    def dith(self, base, val, x, y, levels=4):
        """Дизеринг Байера: val 0..1 -> одна из ступеней яркости."""
        t = BAYER[int(y) & 3][int(x) & 3] / 16.0
        q = int(val * levels + t)
        q = max(0, min(levels, q))
        k = 0.62 + 0.55 * q / levels
        return mul(base, k)

    # --- тени (полупрозрачный слой) ---
    def shadow_box(self, u, v, du, dv, h):
        s = h * 0.55
        foot = [(u, v), (u + du, v), (u + du, v + dv), (u, v + dv)]
        moved = [(a - s, b - s * 0.35) for a, b in foot]
        for q in (foot, moved):
            self.ds.polygon([self.P(a, b, 0) for a, b in q], fill=(20, 24, 30, 70))
        # «рукав» между ними
        self.ds.polygon([self.P(*foot[0]), self.P(*moved[0]), self.P(*moved[3]), self.P(*foot[3])], fill=(20, 24, 30, 70))
        self.ds.polygon([self.P(*foot[0]), self.P(*moved[0]), self.P(*moved[1]), self.P(*foot[1])], fill=(20, 24, 30, 70))

    def shadow_round(self, u, v, r, h):
        s = h * 0.55
        for i in range(0, 11):
            t = i / 10.0
            cu, cv = u - s * t, v - s * 0.35 * t
            x, y = self.P(cu, cv, 0)
            rx, ry = r * 1.414, r * 0.707
            self.ds.ellipse([x - rx, y - ry, x + rx, y + ry], fill=(20, 24, 30, 70))

    def flush(self):
        if self.sh.getbbox() is None:
            return
        # тень видна только там, где уже есть «земля» (не выходит за плиту)
        a = self.sh.getchannel("A")
        from PIL import ImageChops
        a = ImageChops.multiply(a, self.img.getchannel("A"))
        self.sh.putalpha(a)
        self.img = Image.alpha_composite(self.img, self.sh)
        self.sh = Image.new("RGBA", (self.W, self.H), (0, 0, 0, 0))
        self.ds = ImageDraw.Draw(self.sh)
        self.d = ImageDraw.Draw(self.img)

    # --- примитивы ---
    def plate(self, a, b, c, edge=None, thick=2):
        """Наземная плита (диорама) размером 2a x 2b."""
        edge = edge or mul(c, 0.7)
        pts = [(-a, -b), (a, -b), (a, b), (-a, b)]
        for t in range(thick, 0, -1):
            self.d.polygon([self.P(x, y, -t) for x, y in pts], fill=mul(edge, 0.85 + 0.05 * t) + (255,))
        self.poly([(x, y, 0) for x, y in pts], c)
        # лёгкий дизер-шум травы
        if c in (GRASS, GRASS2, GRASS3):
            for i in range(int(a * b * 1.2)):
                u = self.rnd.uniform(-a, a); v = self.rnd.uniform(-b, b)
                x, y = self.P(u, v, 0)
                self.px(x, y, mul(c, self.rnd.choice([0.86, 1.12])))

    def rect(self, u0, v0, du, dv, c, z=0.0):
        self.poly([(u0, v0, z), (u0 + du, v0, z), (u0 + du, v0 + dv, z), (u0, v0 + dv, z)], c)

    def box(self, u0, v0, z0, du, dv, dz, c, top=None, right=None, outline=True):
        u1, v1, z1 = u0 + du, v0 + dv, z0 + dz
        top = top or mul(c, 1.14)
        right = right or mul(c, 0.76)
        self.poly([(u1, v0, z0), (u1, v1, z0), (u1, v1, z1), (u1, v0, z1)], right)
        self.poly([(u0, v1, z0), (u1, v1, z0), (u1, v1, z1), (u0, v1, z1)], c)
        self.poly([(u0, v0, z1), (u1, v0, z1), (u1, v1, z1), (u0, v1, z1)], top)
        if outline:
            x, y = self.P(u1, v1, z0)
            x2, y2 = self.P(u1, v1, z1)
            self.d.line([(x, y), (x2, y2)], fill=mul(c, 1.25) + (255,))

    def faceL(self, u, v1, z, c, layer=None):  # точка на западной (левой) грани
        x, y = self.P(u, v1, z); self.px(x, y, c, layer)

    def faceR(self, u1, v, z, c, layer=None):  # точка на южной (правой) грани
        x, y = self.P(u1, v, z); self.px(x, y, c, layer)

    def windows(self, u0, v0, z0, du, dv, dz, step=2, zstep=3, c=GLASS, lit=0.6, margin=1):
        u1, v1 = u0 + du, v0 + dv
        z = z0 + 2
        while z < z0 + dz - 1:
            u = u0 + margin
            while u < u1 - margin + 0.01:
                self.faceL(u, v1, z, c)
                if self.rnd.random() < lit:
                    self.faceL(u, v1, z, LIT if self.rnd.random() < 0.7 else LIT2, self.em)
                u += step
            v = v0 + margin
            while v < v1 - margin + 0.01:
                self.faceR(u1, v, z, mul(c, 0.8))
                if self.rnd.random() < lit:
                    self.faceR(u1, v, z, LIT if self.rnd.random() < 0.7 else LIT2, self.em)
                v += step
            z += zstep

    def arches(self, face, a0, a1, fixed, z0, h, step, c, w=1):
        """Ряд арок/проёмов на грани: вертикальные тёмные полосы с закруглением."""
        a = a0
        while a <= a1:
            for k in range(w):
                for z in range(int(z0), int(z0 + h)):
                    if face == "L":
                        self.faceL(a + k, fixed, z, c)
                    else:
                        self.faceR(fixed, a + k, z, c)
            a += step

    def cyl(self, u, v, z0, r, h, c, cap=None, bands=None):
        cx, cyb = self.P(u, v, z0)
        _, cyt = self.P(u, v, z0 + h)
        rx, ry = r * 1.414, r * 0.707
        for ix in range(int(-rx), int(rx) + 1):
            t = ix / max(rx, 0.5)
            if abs(t) > 1: continue
            e = ry * math.sqrt(max(0, 1 - t * t))
            val = 0.85 - 0.6 * (t + 1) / 2
            for iy in range(int(cyt + e), int(cyb + e) + 1):
                col = self.dith(c, val, cx + ix, iy)
                if bands:
                    zz = cyb + e - iy
                    for (bz, bh, bc) in bands:
                        if bz <= zz < bz + bh:
                            col = self.dith(bc, val, cx + ix, iy)
                self.px(cx + ix, iy, col)
        cap = cap or mul(c, 1.15)
        self.d.ellipse([cx - rx, cyt - ry, cx + rx, cyt + ry], fill=cap + (255,))

    def dome(self, u, v, z, r, c, hk=1.15, ribs=0, tip=GOLD, onion=False):
        cx, cy = self.P(u, v, z)
        rx, ry = r * 1.414, r * 0.707
        H = rx * hk
        for iy in range(int(-H - 2), int(ry) + 1):
            for ix in range(int(-rx) - 1, int(rx) + 2):
                nx = ix / rx
                if iy < 0:
                    ny = iy / H
                    w = 1.0
                    if onion:  # луковичная форма: шире в середине, сужается к верху
                        k = -ny
                        w = 1.0 + 0.18 * math.sin(k * math.pi * 1.1) - 0.25 * max(0, k - 0.6) / 0.4
                        nx = ix / (rx * max(w, 0.05))
                    if nx * nx + ny * ny > 1: continue
                else:
                    ny = iy / max(ry, 0.5)
                    if nx * nx + ny * ny > 1: continue
                nz = math.sqrt(max(0, 1 - nx * nx - min(1, ny * ny)))
                b = 0.2 + 0.8 * max(0, -0.55 * nx - 0.45 * ny + 0.7 * nz)
                col = self.dith(c, min(1, b), cx + ix, cy + iy, 5)
                if ribs and iy < 0:
                    ang = math.asin(max(-1, min(1, nx)))
                    if int((ang + 1.6) * ribs / 1.6) % 2 == 0:
                        col = mul(col, 0.86)
                self.px(cx + ix, cy + iy, col)
        if tip:
            for k in range(int(H) + 1, int(H) + 5):
                self.px(cx, cy - k, tip)
            self.px(cx, cy - H - 5, mul(tip, 1.2))

    def cone(self, u, v, z, r, h, c):
        cx, cy = self.P(u, v, z)
        rx, ry = r * 1.414, r * 0.707
        for iy in range(int(-h), int(ry) + 1):
            if iy < 0:
                w = rx * (1 + iy / h)
            else:
                w = rx * math.sqrt(max(0, 1 - (iy / ry) ** 2))
            for ix in range(int(-w), int(w) + 1):
                t = ix / max(rx, 1)
                self.px(cx + ix, cy + iy, self.dith(c, 0.85 - 0.6 * (t + 1) / 2, cx + ix, cy + iy))

    def tree(self, u, v, size=3.0, kind=None):
        rnd = self.rnd
        kind = kind or rnd.choice(["round", "round", "round", "round", "autumn", "cone", "blossom"])
        x, y = self.P(u, v, 0)
        # тень
        self.flush()  # сначала применяем накопленные тени
        self.ds.ellipse([x - size * 1.6 - 3, y - size * 0.6 - 2, x + size * 0.6, y + size * 0.5], fill=(20, 26, 20, 80))
        self.flush()
        th = int(size * 1.2) + 2
        for k in range(th):
            self.px(x, y - k, TRUNK)
        if kind == "cone":
            col = (52, 92, 58)
            for iy in range(int(size * 3.2)):
                w = (iy / (size * 3.2)) * size * 1.1
                yy = y - th - size * 3.2 + iy + 2
                for ix in range(int(-w), int(w) + 1):
                    self.px(x + ix, yy, self.dith(col, 0.9 - 0.5 * (ix / max(w, 1) + 1) / 2, x + ix, yy))
            return
        col = {"round": rnd.choice([(84, 128, 58), (96, 140, 62), (74, 116, 54)]),
               "autumn": rnd.choice([(196, 132, 52), (176, 110, 46), (206, 160, 70)]),
               "blossom": (214, 170, 176)}[kind]
        cxx, cyy = x, y - th - size + 1
        r = size + 0.5
        for iy in range(int(-r) - 1, int(r) + 2):
            for ix in range(int(-r) - 1, int(r) + 2):
                d = (ix / r) ** 2 + (iy / (r * 0.95)) ** 2
                if d > 1: continue
                b = 0.95 - 0.45 * ((ix + iy) / (2 * r) + 0.5) - 0.2 * d
                self.px(cxx + ix, cyy + iy, self.dith(col, max(0, min(1, b)), cxx + ix, cyy + iy))

    def water(self, u0, v0, du, dv, z=0.0):
        self.rect(u0, v0, du, dv, WATER, z)
        for v in range(int(v0) + 1, int(v0 + dv) - 1):
            for u in range(int(u0) + 1, int(u0 + du) - 1):
                if (u * 7 + v * 13 + self.f * 5) % 11 == 0:
                    x, y = self.P(u, v, z)
                    self.px(x, y, WATER2)
                    self.px(x + 1, y, WATER2)

    def fountain(self, u, v, r=3):
        x, y = self.P(u, v, 0)
        rx, ry = r * 1.414, r * 0.707
        self.d.ellipse([x - rx - 1, y - ry - 1, x + rx + 1, y + ry + 1], fill=STONE + (255,))
        self.d.ellipse([x - rx, y - ry, x + rx, y + ry], fill=WATER + (255,))
        jets = [(0, 0, 7), (-0.5, 0.5, 4), (0.6, -0.3, 4)]
        for k, (du, dv, h) in enumerate(jets):
            jx, jy = self.P(u + du, v + dv, 0)
            hh = h + (1 if (self.f + k) % 2 else 0)
            for i in range(int(hh)):
                self.px(jx, jy - i, WATER2 if i < hh - 1 else (230, 245, 255))
            self.px(jx - 1, jy - hh + 1 + self.f, (200, 230, 250))
            self.px(jx + 1, jy - hh + 2 - self.f, (200, 230, 250))

    def lamp(self, u, v, h=5):
        x, y = self.P(u, v, 0)
        for k in range(h):
            self.px(x, y - k, DARK)
        self.px(x, y - h, (240, 230, 190))
        self.px(x, y - h, LIT, self.em)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            self.px(x + dx, y - h + dy, (255, 210, 120, 110), self.em)

    def bitmap(self, x0, y0, rows, pal, k=1):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in pal:
                    for a in range(k):
                        for b in range(k):
                            self.px(x0 + i * k + a, y0 + j * k + b, pal[ch])

    def trees_ring(self, a, b, n, margin=2, size=(2.4, 3.6), kinds=None):
        pts = []
        for i in range(n):
            side = self.rnd.randint(0, 3)
            t = self.rnd.uniform(-1, 1)
            m = self.rnd.uniform(0, margin)
            if side == 0: pts.append((-a + m + 1, t * (b - 1)))
            elif side == 1: pts.append((a - m - 1, t * (b - 1)))
            elif side == 2: pts.append((t * (a - 1), -b + m + 1))
            else: pts.append((t * (a - 1), b - m - 1))
        out = []
        for u, v in pts:
            out.append((u, v, self.rnd.uniform(*size), self.rnd.choice(kinds) if kinds else None))
        return out

    def T(self, pts, front, thr=0.0):
        """Рисует деревья только позади (front=False) или впереди (front=True) от линии u+v=thr."""
        pts = [p if len(p) == 4 else (p[0], p[1], 3.0, "round") for p in pts]
        for u, v, sz, kind in sorted(pts, key=lambda p: p[0] + p[1]):
            if (u + v >= thr) == front:
                self.tree(u, v, sz, kind)


# =====================================================================
#                       ДОСТОПРИМЕЧАТЕЛЬНОСТИ
# =====================================================================

def s_amir_temur(s):
    s.plate(30, 30, GRASS)
    # круговые дорожки
    for r, c in ((26, PATH), (24, GRASS2), (11, PATH), (9, PAVE)):
        x, y = s.P(0, 0, 0)
        s.d.ellipse([x - r * 1.414, y - r * 0.707, x + r * 1.414, y + r * 0.707], fill=c + (255,))
    for ang in range(0, 360, 45):
        a = math.radians(ang)
        for k in range(10, 26):
            u, v = math.cos(a) * k, math.sin(a) * k
            x, y = s.P(u, v, 0)
            s.d.rectangle([x - 1, y, x + 1, y], fill=PATH + (255,))
    s.flush()
    # деревья по кругу (знаменитые чинары сквера)
    pts = []
    for i in range(46):
        a = s.rnd.uniform(0, math.pi * 2)
        r = s.rnd.uniform(15, 23)
        pts.append((math.cos(a) * r, math.sin(a) * r))
    for i in range(18):
        t = s.rnd.uniform(-1, 1)
        pts.append((s.rnd.choice([-28, 28]) + s.rnd.uniform(-1, 1), t * 27))
    pts.sort(key=lambda p: p[0] + p[1])
    back = [p for p in pts if p[0] + p[1] < -6]
    front = [p for p in pts if p[0] + p[1] >= -6]
    for u, v in back:
        s.tree(u, v, s.rnd.uniform(2.6, 3.8), s.rnd.choice(["round", "round", "autumn", "round"]))
    s.flush()
    # постамент
    s.shadow_box(-3, -3, 6, 6, 16)
    s.flush()
    s.box(-4, -4, 0, 8, 8, 2, STONE)
    s.box(-3, -3, 2, 6, 6, 9, (150, 140, 128))
    s.windows(-3, -3, 2, 6, 6, 9, step=2, zstep=3, c=(120, 112, 102), lit=0.0)
    s.box(-3.5, -3.5, 11, 7, 7, 1, STONE)
    # всадник
    x, y = s.P(0, 0, 12)
    horse = [
        "          bb           ",
        "          gbb          ",
        "         gbbb          ",
        "         bbbb          ",
        "        bbbbbb         ",
        "       bbgbbbb         ",
        "  bb   bbbbbbb         ",
        " bgbb  bbbbbbbbb       ",
        " bbbbbbbbbbbbbbbbbb    ",
        "bgb  bbbbbbbbbbbbbbbb  ",
        "bb   gbbbbbbbbbbbbbbbb ",
        "      bbbbbbbbbbbbbbb b",
        "      gbbbbbbbbbbbbb  b",
        "      gbbb    bbbbb    ",
        "      bb b    bb  b    ",
        "     bb  b    b    b   ",
        "     b   b    b    b   ",
        "     b   bb   bb   bb  ",
    ]
    s.bitmap(int(x) - 11, int(y) - 17, horse, {"b": BRONZE, "g": BRONZE2})
    for u, v in front:
        s.tree(u, v, s.rnd.uniform(2.6, 3.8), s.rnd.choice(["round", "round", "autumn", "round"]))
    for a in range(0, 360, 60):
        r = math.radians(a + 20)
        s.lamp(math.cos(r) * 12, math.sin(r) * 12)
    s.flush()
    s.fountain(18, 18, 2.5)


def s_tv_tower(s):
    s.plate(16, 16, PAVE)
    s.rect(-14, -14, 28, 28, GRASS)
    s.rect(-6, -6, 12, 12, PAVE2)
    s.flush()
    TR = s.trees_ring(16, 16, 16, margin=3)
    s.T(TR, False)
    s.flush()
    s.shadow_round(0, 0, 3, 120)
    s.flush()
    # три опоры
    for (u, v) in ((-5, 2), (3, -4), (3, 5)):
        x0, y0 = s.P(u, v, 0)
        x1, y1 = s.P(0, 0, 34)
        steps = 40
        for i in range(steps + 1):
            t = i / steps
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            s.px(x, y, mul(STONE, 0.9)); s.px(x + 1, y, mul(STONE, 0.7))
    s.cyl(0, 0, 0, 2.2, 6, PAVE2)
    # ствол
    s.cyl(0, 0, 6, 1.6, 64, (206, 200, 196), bands=[(20, 2, RED), (40, 2, RED)])
    # смотровые «тарелки»
    s.cyl(0, 0, 70, 5.2, 3, (190, 186, 182))
    s.cyl(0, 0, 73, 4.2, 4, GLASS)
    s.cyl(0, 0, 77, 5.6, 2, (210, 206, 200))
    for a in range(0, 360, 30):
        r = math.radians(a)
        if math.sin(r + 0.8) > -0.2:
            s.px(*s.P(math.cos(r) * 4.2, math.sin(r) * 4.2, 75), LIT, s.em)
    s.cyl(0, 0, 79, 1.2, 20, (220, 216, 212), bands=[(4, 2, RED), (10, 2, RED)])
    s.cyl(0, 0, 99, 2.4, 2, (200, 196, 190))
    s.cyl(0, 0, 101, 0.6, 22, (230, 228, 226), bands=[(4, 3, RED), (11, 3, RED), (18, 3, RED)])
    x, y = s.P(0, 0, 124)
    on = s.f == 0
    s.px(x, y, (255, 60, 40) if on else (120, 40, 30))
    if on:
        s.px(x, y, (255, 70, 50, 255), s.em)
        for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
            s.px(x + dx, y + dy, (255, 60, 40, 140), s.em)
    x, y = s.P(0, 0, 72)
    s.px(x - 7, y, (255, 60, 40) if not on else (120, 40, 30))
    if not on: s.px(x - 7, y, (255, 70, 50, 255), s.em)
    s.T(TR, True)


def s_hazrati_imam(s):
    s.plate(30, 26, PAVE)
    s.rect(-28, -24, 56, 48, (196, 184, 160))
    for i in range(-26, 27, 4):
        s.rect(i, -24, 0.5, 48, mul(PAVE, 1.06))
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((22, 6), (24, 14), (18, 20), (-20, -20), (-24, -12), (20, -2))]
    s.T(TR, False)
    s.flush()
    # главная мечеть Хаст-Имам (Телляшайх)
    s.shadow_box(-14, -12, 18, 26, 18); s.flush()
    s.box(-14, -12, 0, 18, 26, 14, SAND)
    s.arches("L", -12, 2, 14, 2, 7, 3, mul(SAND, 0.55), w=2)
    s.arches("R", -10, 12, 4, 2, 7, 3, mul(SAND, 0.55), w=2)
    s.dome(-6, -4, 14, 5.5, TURQ, onion=False, ribs=0)
    s.dome(-6, 6, 14, 5.5, TURQ, onion=False)
    # портал (пештак)
    s.box(4, -4, 0, 3, 10, 22, SAND2)
    for z in range(3, 18):
        for v in range(-2, 5):
            s.faceR(7, v, z, mul(BLUE, 0.9) if (z + v) % 5 else TURQ)
    for z in range(3, 14):
        for v in range(-1, 4):
            s.faceR(7, v, z, mul(DBLUE, 0.7))
    # минареты
    for v in (-8, 10):
        s.shadow_round(6, v, 2, 46); s.flush()
        s.cyl(6, v, 0, 2.2, 44, SAND2, bands=[(10, 2, TURQ), (24, 2, TURQ), (38, 3, BLUE)])
        s.cyl(6, v, 44, 2.8, 3, SAND)
        s.dome(6, v, 47, 2.4, TURQ, hk=1.3)
        s.lamp(10, v + 3, 4)
    # медресе Барак-хана (справа спереди)
    s.box(12, -22, 0, 12, 14, 9, SAND)
    s.arches("L", 13, 22, -8, 1, 5, 3, mul(SAND, 0.5), w=2)
    s.dome(18, -16, 9, 3.5, TURQ)
    s.box(-24, 14, 0, 12, 8, 8, SAND)
    s.arches("R", 15, 21, -12, 1, 5, 3, mul(SAND, 0.5), w=1)
    s.windows(-24, 14, 0, 12, 8, 8, step=3, zstep=4, c=mul(SAND, 0.5), lit=0.5)
    s.T(TR, True)
    s.flush()


def s_chorsu(s):
    s.plate(28, 28, PAVE)
    s.flush()
    # торговые ряды под навесами
    cols = [(196, 64, 54), (60, 120, 170), (220, 180, 70), (90, 150, 90), (220, 220, 210)]
    for u in range(-26, 27, 5):
        for v in (-26, -21, 19, 23):
            s.box(u, v, 0, 4, 3, 3, cols[(u + v) % 5], outline=False)
    for v in range(-17, 18, 5):
        for u in (19, 23):
            s.box(u, v, 0, 3, 4, 3, cols[(u * 3 + v) % 5], outline=False)
    s.shadow_round(0, 0, 15, 22); s.flush()
    s.cyl(0, 0, 0, 16, 6, (210, 200, 182), bands=[(1, 3, mul(BLUE, 1.0))])
    for a in range(0, 360, 12):
        r = math.radians(a)
        u, v = math.cos(r) * 16, math.sin(r) * 16
        if u + v > -4:
            x, y = s.P(u, v, 2)
            for k in range(3): s.px(x, y + k, DARK)
            s.px(x, y + 1, LIT, s.em)
    s.dome(0, 0, 6, 15.5, (40, 150, 178), hk=0.55, ribs=7, tip=None)
    s.cyl(0, 0, 17, 3, 2, (220, 214, 200))
    s.dome(0, 0, 19, 3, TURQ, hk=0.9)
    # малые купола вокруг
    for a in (200, 250, 300, 340):
        r = math.radians(a)
        s.dome(math.cos(r) * 22, math.sin(r) * 22, 0, 3.5, TURQ, hk=0.7, tip=None)
    for a in (20, 70, 120):
        r = math.radians(a)
        s.dome(math.cos(r) * 22, math.sin(r) * 22, 0, 3.5, TURQ, hk=0.7, tip=None)
    # люди-точки
    for i in range(40):
        u, v = s.rnd.uniform(-26, 26), s.rnd.uniform(-26, 26)
        if u * u + v * v < 300: continue
        x, y = s.P(u, v, 0)
        c = s.rnd.choice(cols)
        s.px(x + (s.f if i % 2 else 0), y - 1, c); s.px(x + (s.f if i % 2 else 0), y, DARK)


def s_minor(s):
    s.plate(26, 22, GRASS)
    s.water(-26, 10, 52, 9)  # канал Анхор
    s.rect(-20, -18, 30, 26, MARBLE)
    s.flush()
    TR = s.trees_ring(26, 22, 14, margin=3, kinds=["round", "cone", "round"])
    s.T(TR, False)
    s.flush()
    s.shadow_box(-14, -12, 20, 18, 16); s.flush()
    s.box(-14, -12, 0, 20, 18, 11, MARBLE)
    s.arches("L", -12, 4, 6, 2, 6, 3, (170, 190, 200), w=2)
    s.arches("R", -10, 4, 6, 2, 6, 3, (170, 190, 200), w=2)
    s.box(2, -6, 0, 4, 10, 17, WHITE)
    for z in range(3, 14):
        for v in range(-4, 3):
            s.faceR(6, v, z, SKY if (v + z) % 4 else BLUE)
    s.dome(-5, -3, 11, 6.2, SKY, hk=1.25, onion=False)
    s.shadow_round(4, -14, 2, 40); s.flush()
    s.cyl(4, -14, 0, 2, 40, MARBLE, bands=[(30, 2, SKY), (36, 2, SKY)])
    s.cyl(4, -14, 40, 2.6, 2, WHITE)
    s.dome(4, -14, 42, 2.1, SKY, hk=1.4)
    for v in (-16, -8, 0, 8):
        s.lamp(12, v, 4)
    s.T(TR, True)


def s_mustaqillik(s):
    s.plate(34, 26, GRASS)
    s.rect(-32, -4, 64, 8, PAVE)
    s.rect(-4, -24, 8, 48, PAVE)
    s.fountain(-16, -12, 3); s.fountain(-16, 12, 3)
    s.flush()
    TR = [(u, v, 3.2, "round") for (u, v) in ((-28, -20), (-24, 20), (-30, 10), (-10, -22), (-10, 22), (10, -22), (10, 22), (28, -22), (28, 22))]
    s.T(TR, False)
    s.flush()
    # арка Эзгулик с аистами
    s.shadow_box(18, -20, 3, 40, 14); s.flush()
    for v in range(-20, 21, 4):
        s.box(18, v, 0, 2, 1.4, 12, WHITE)
    s.box(17, -21, 12, 4, 42, 2, MARBLE)
    for v in range(-18, 19, 6):
        x, y = s.P(19, v, 14)
        bird = ["  w  ", " www ", "kwwwk", "  o  "]
        s.bitmap(int(x) - 2, int(y) - 4 - (1 if (v // 6 + s.f) % 2 else 0), bird, {"w": (250, 250, 245), "k": DARK, "o": (230, 140, 40)})
    # монумент Независимости
    s.shadow_box(-4, -4, 8, 8, 20); s.flush()
    s.box(-5, -5, 0, 10, 10, 2, STONE)
    s.box(-2.5, -2.5, 2, 5, 5, 12, (200, 194, 186))
    s.dome(0, 0, 14, 3.4, GOLD, hk=1.0, tip=None)
    x, y = s.P(0, 0, 14)
    for k in range(-5, 6):
        s.px(x + k, y - 2 + abs(k) // 3, mul(GOLD, 0.7))
    # статуя «счастливая мать»
    x, y = s.P(5, 5, 2)
    s.bitmap(int(x) - 1, int(y) - 7, [" b ", "bbb", " b ", "bbb", "bbb", "b b", "b b"], {"b": BRONZE2})
    s.T(TR, True)
    for u in range(-28, 15, 7):
        s.lamp(u, -5, 4); s.lamp(u, 5, 4)
    s.flush()


def s_navoi_theatre(s):
    s.plate(26, 24, PAVE)
    s.rect(4, -22, 20, 44, GRASS)
    s.fountain(14, 0, 4)
    s.flush()
    TR = [(u, v, 2.8, s.rnd.choice(["round", "cone"])) for (u, v) in ((20, -18), (22, 18), (8, -20), (8, 20), (16, 12), (18, -10))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-20, -16, 22, 32, 18); s.flush()
    s.box(-20, -16, 0, 22, 32, 14, (214, 186, 140))
    s.box(-14, -10, 14, 12, 20, 6, (200, 172, 126))
    s.box(-12, -8, 20, 8, 16, 2, ROOF)
    # аркада фасада
    s.box(2, -10, 0, 3, 20, 10, (224, 198, 152))
    s.arches("R", -9, 9, 5, 1, 7, 3, mul((214, 186, 140), 0.45), w=2)
    s.windows(-20, -16, 0, 22, 32, 14, step=3, zstep=5, c=mul((214, 186, 140), 0.55), lit=0.75)
    for v in (-14, -6, 6, 14):
        s.lamp(6, v, 5)
    s.T(TR, True)
    s.flush()


def s_kukeldash(s):
    s.plate(26, 24, PAVE)
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((20, -20), (22, 16), (-22, 20), (18, 22))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-18, -18, 30, 36, 20); s.flush()
    s.box(-18, -18, 0, 30, 36, 11, SAND)
    s.arches("L", -16, 8, 18, 2, 6, 4, mul(SAND, 0.55), w=2)
    s.arches("R", -16, 12, 12, 2, 6, 4, mul(SAND, 0.55), w=2)
    s.dome(-10, -10, 11, 3, TURQ, hk=0.9); s.dome(-10, 8, 11, 3, TURQ, hk=0.9)
    # пештак
    s.box(10, -8, 0, 4, 16, 24, SAND2)
    for z in range(2, 22):
        for v in range(-8, 8):
            if z > 19 or v in (-8, -7, 6, 7):
                s.faceR(14, v, z, TURQ if (z + v) % 3 else BLUE)
    for z in range(2, 17):
        for v in range(-4, 4):
            s.faceR(14, v, z, mul(DBLUE, 0.75) if z < 16 - abs(v) // 2 else TURQ)
    # гульдасты
    for v in (-9, 8):
        s.cyl(13, v, 0, 1.6, 27, SAND, bands=[(20, 2, TURQ)])
        s.dome(13, v, 27, 1.8, TURQ, hk=1.0)
    for v in (-18, 18):
        s.cyl(12, v, 0, 1.8, 14, SAND2)
        s.dome(12, v, 14, 2, TURQ, hk=1.0, tip=None)
    s.T(TR, True)
    s.flush()


def s_magic_city(s):
    s.plate(30, 26, GRASS)
    s.water(-26, -24, 22, 18)
    s.rect(-2, -22, 6, 46, PATH)
    s.rect(-28, 0, 56, 5, PATH)
    s.flush()
    TR = s.trees_ring(30, 26, 28, margin=4, kinds=["round", "blossom", "autumn", "round"])
    s.T(TR, False)
    s.flush()
    s.shadow_box(-10, -2, 20, 20, 24); s.flush()
    s.box(-10, -2, 0, 20, 20, 12, (236, 222, 206))
    s.windows(-10, -2, 0, 20, 20, 12, step=3, zstep=4, c=(120, 90, 140), lit=0.8)
    towers = [(-10, -2, (200, 70, 80)), (10, -2, (80, 110, 200)), (-10, 18, (150, 80, 180)), (10, 18, (230, 150, 60))]
    for u, v, c in sorted(towers, key=lambda t: t[0] + t[1]):
        s.cyl(u, v, 0, 2.8, 20, (240, 230, 216))
        s.cone(u, v, 20, 3.4, 14, c)
        x, y = s.P(u, v, 34)
        s.px(x, y - 1, DARK); s.px(x, y - 2, DARK)
        s.px(x + 1 + s.f, y - 2, c); s.px(x + 1, y - 3, c)
    s.cyl(0, 8, 12, 4, 16, (244, 236, 224))
    s.cone(0, 8, 28, 5, 18, (60, 160, 190))
    # колесо обозрения
    cx, cy = s.P(20, -16, 18)
    R = 12
    for a in range(0, 360, 4):
        r = math.radians(a)
        s.px(cx + math.cos(r) * R, cy + math.sin(r) * R, (230, 230, 236))
    for a in range(0, 360, 30):
        r = math.radians(a + s.f * 15)
        for k in range(R):
            s.px(cx + math.cos(r) * k, cy + math.sin(r) * k, (180, 180, 190))
        x, y = cx + math.cos(r) * R, cy + math.sin(r) * R
        s.d.rectangle([x - 1, y, x + 1, y + 2], fill=(220, 70, 70, 255))
        s.px(x, y + 1, LIT, s.em)
    x0, y0 = s.P(20, -16, 0)
    s.d.line([(x0 - 5, y0), (cx, cy)], fill=(160, 160, 170, 255))
    s.d.line([(x0 + 5, y0), (cx, cy)], fill=(160, 160, 170, 255))
    s.T(TR, True)
    for i in range(0, 50, 9):
        s.lamp(-26 + i, 7, 4)
    s.flush()


def s_temurid(s):
    s.plate(20, 20, PAVE)
    s.rect(-18, -18, 36, 36, GRASS2)
    s.rect(-3, -18, 6, 36, PAVE)
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((-16, -16), (16, -16), (-16, 16), (16, 16), (14, 4), (-14, 6))]
    s.T(TR, False)
    s.flush()
    s.shadow_round(0, 0, 11, 28); s.flush()
    s.cyl(0, 0, 0, 12, 2, STONE)
    s.cyl(0, 0, 2, 11, 12, WHITE)
    for a in range(0, 360, 14):
        r = math.radians(a)
        u, v = math.cos(r) * 11, math.sin(r) * 11
        if u + v > -3:
            x, y = s.P(u, v, 3)
            for k in range(9): s.px(x, y - k, (150, 170, 190))
            s.px(x, y - 4, LIT, s.em)
    s.cyl(0, 0, 14, 11.6, 2, MARBLE)
    s.dome(0, 0, 16, 10.5, (40, 110, 190), hk=0.9, ribs=9)
    s.T(TR, True)
    s.flush()


def s_hotel_uz(s):
    s.plate(22, 20, PAVE)
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((14, -16), (16, 8), (12, 16), (-18, 16))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-8, -16, 10, 32, 60); s.flush()
    s.box(-8, -16, 0, 10, 32, 4, (190, 180, 170))
    s.box(-6, -14, 4, 7, 28, 50, (222, 214, 200))
    # знаменитая «ажурная» решётка
    for z in range(6, 52, 2):
        for v in range(-13, 14, 2):
            s.faceR(1, v, z, (150, 140, 128) if z % 4 else (120, 112, 104))
            if s.rnd.random() < 0.5:
                s.faceR(1, v, z, LIT, s.em)
        for u in range(-5, 1, 2):
            s.faceL(u, 14, z, (160, 150, 140))
            if s.rnd.random() < 0.4:
                s.faceL(u, 14, z, LIT2, s.em)
    s.box(-6.5, -14.5, 54, 8, 29, 2, (200, 190, 176))
    s.T(TR, True)
    for v in (-12, 0, 12):
        s.lamp(8, v, 4)
    s.flush()


def s_tashkent_city(s):
    s.plate(30, 28, PAVE)
    s.rect(-28, 6, 56, 20, GRASS)
    s.water(-12, 10, 26, 8)
    s.flush()
    TR = [(u, v, 3, s.rnd.choice(["round", "cone"])) for (u, v) in ((-26, 22), (-18, 24), (18, 22), (24, 16), (26, 24), (-24, 14))]
    s.T(TR, False)
    s.flush()
    towers = [(-22, -24, 8, 8, 44, (110, 150, 170)), (-6, -22, 9, 9, 66, (90, 130, 160)),
              (12, -24, 8, 8, 40, (130, 160, 176)), (-24, -10, 9, 9, 30, (150, 170, 180)),
              (4, -8, 8, 8, 88, (70, 112, 150)), (18, -8, 8, 9, 34, (120, 156, 174))]
    for t in sorted(towers, key=lambda t: t[0] + t[1]):
        s.shadow_box(t[0], t[1], t[2], t[3], t[4] * 0.6)
    s.flush()
    for u, v, du, dv, h, c in sorted(towers, key=lambda t: t[0] + t[1]):
        s.box(u, v, 0, du, dv, h, c, top=mul(c, 1.25))
        s.windows(u, v, 0, du, dv, h, step=2, zstep=2, c=mul(c, 1.25), lit=0.45, margin=0.5)
    # Nest One — шпиль
    x, y = s.P(8, -4, 88)
    for k in range(10): s.px(x, y - k, (200, 210, 220))
    s.px(x, y - 10, (255, 60, 40) if s.f == 0 else (120, 50, 40))
    if s.f == 0: s.px(x, y - 10, (255, 70, 50, 255), s.em)
    s.T(TR, True)
    for u in range(-24, 25, 8):
        s.lamp(u, 7, 4)
    s.flush()


def s_romanov(s):
    s.plate(22, 20, GRASS)
    s.rect(6, -18, 14, 36, PATH)
    s.flush()
    TR = [(u, v, 3, s.rnd.choice(["round", "autumn"])) for (u, v) in ((14, -16), (16, 14), (-20, 16), (-20, -16), (10, 18), (12, -10))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-16, -14, 20, 28, 16); s.flush()
    s.box(-16, -14, 0, 20, 28, 10, BRICK)
    s.windows(-16, -14, 0, 20, 28, 10, step=3, zstep=4, c=(230, 220, 200), lit=0.4)
    s.box(-16.5, -14.5, 10, 21, 29, 1, (220, 210, 196))
    s.box(-14, -12, 11, 16, 24, 3, ROOF, top=mul(ROOF, 1.2))
    for v in (-14, 11):
        s.box(1, v, 0, 4, 4, 15, BRICK2)
        s.cone(3, v + 2, 15, 2.6, 7, (80, 110, 100))
    s.box(4, -4, 0, 2, 8, 8, (220, 210, 196))
    s.T(TR, True)
    s.flush()


def s_applied_arts(s):
    s.plate(18, 18, PAVE)
    s.rect(-14, -14, 28, 28, GRASS2)
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((14, -14), (14, 14), (-15, 15))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-12, -12, 22, 24, 12); s.flush()
    s.box(-12, -12, 0, 22, 24, 8, (230, 220, 200))
    s.box(-12.5, -12.5, 8, 23, 25, 1.5, (170, 120, 80))
    s.windows(-12, -12, 0, 22, 24, 8, step=4, zstep=4, c=(80, 110, 140), lit=0.5)
    s.box(10, -4, 0, 2, 8, 13, (236, 228, 210))
    for z in range(2, 12):
        for v in range(-3, 4):
            s.faceR(12, v, z, TURQ if (z * 3 + v) % 4 else GOLD)
    s.T(TR, True)
    s.flush()


def s_courage(s):
    s.plate(22, 20, GRASS)
    s.rect(-6, -18, 12, 36, PAVE)
    s.rect(-20, -6, 40, 12, PAVE)
    s.flush()
    TR = [(u, v, 3.2, s.rnd.choice(["round", "cone"])) for (u, v) in ((-16, -16), (-16, 16), (16, -16), (16, 16), (-10, -14), (10, 14), (14, -10), (-14, 10))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-4, -6, 6, 6, 8); s.flush()
    # треснувший куб с часами
    s.box(-4, -6, 0, 6, 6, 6, (70, 66, 64))
    x, y = s.P(2, -3, 3)
    s.d.line([(x - 2, y - 4), (x + 1, y + 2)], fill=(30, 28, 26, 255))
    x, y = s.P(-1, 0, 4)
    s.px(x, y, (220, 210, 180)); s.px(x, y - 1, (220, 210, 180))
    # фигура мужчины
    x, y = s.P(4, 4, 2)
    s.box(2, 2, 0, 5, 5, 2, (150, 140, 130))
    s.bitmap(int(x) - 2, int(y) - 14, ["  bb ", "  bb ", " bbbb", "bbbbb", "b bbb", "  bbb", "  bbb", "  b b", "  b b", "  b b", " b  b"], {"b": (90, 84, 80)})
    s.T(TR, True)
    s.flush()


def s_pakhtakor(s):
    s.plate(30, 26, GRASS3)
    s.flush()
    TR = s.trees_ring(30, 26, 22, margin=3, kinds=["round", "autumn", "autumn"])
    s.T(TR, False)
    s.flush()
    s.shadow_box(-22, -16, 44, 32, 10); s.flush()
    u0, v0, du, dv, h = -22, -16, 44, 32, 9
    s.box(u0, v0, 0, du, dv, h, (220, 216, 210))
    for z in range(1, h):
        for u in range(u0, u0 + du, 2):
            s.faceL(u, v0 + dv, z, (170, 166, 160) if z % 3 else (130, 126, 122))
        for v in range(v0, v0 + dv, 2):
            s.faceR(u0 + du, v, z, (150, 146, 140) if z % 3 else (116, 112, 108))
    # трибуны (верх) + поле
    s.rect(u0, v0, du, dv, (180, 40, 40), h)
    for k in range(1, 6):
        s.rect(u0 + k, v0 + k, du - 2 * k, dv - 2 * k, (200, 60, 54) if k % 2 else (150, 34, 34), h - k * 0.8)
    s.rect(u0 + 6, v0 + 6, du - 12, dv - 12, (70, 140, 60), h - 5)
    for i in range(u0 + 6, u0 + du - 6, 4):
        s.rect(i, v0 + 6, 2, dv - 12, (84, 156, 70), h - 5)
    x, y = s.P(0, 0, h - 5)
    s.d.ellipse([x - 5, y - 3, x + 5, y + 3], outline=(230, 240, 230, 255))
    xa, ya = s.P(0, v0 + 6, h - 5); xb, yb = s.P(0, v0 + dv - 6, h - 5)
    s.d.line([(xa, ya), (xb, yb)], fill=(230, 240, 230, 255))
    for (u, v) in ((u0, v0), (u0 + du, v0), (u0, v0 + dv), (u0 + du, v0 + dv)):
        x, y = s.P(u, v, h)
        for k in range(16): s.px(x, y - k, (90, 90, 96))
        s.d.rectangle([x - 2, y - 19, x + 2, y - 16], fill=(230, 230, 220, 255))
        s.de.rectangle([x - 2, y - 19, x + 2, y - 16], fill=(255, 250, 220, 255))
        s.de.rectangle([x - 4, y - 21, x + 4, y - 14], outline=(255, 240, 200, 90))
    s.T(TR, True)
    s.flush()


def s_station(s):
    s.plate(22, 32, PAVE)
    s.rect(-20, -30, 10, 60, (110, 100, 92))
    for v in range(-30, 30, 2):
        s.rect(-19, v, 8, 0.6, (80, 72, 66))
    s.flush()
    TR = [(u, v, 3, "round") for (u, v) in ((18, -28), (18, 28), (16, -14), (16, 14))]
    s.T(TR, False)
    s.flush()
    s.shadow_box(-8, -26, 14, 52, 14); s.flush()
    s.box(-8, -26, 0, 14, 52, 9, (232, 224, 206))
    s.windows(-8, -26, 0, 14, 52, 9, step=3, zstep=4, c=(70, 110, 150), lit=0.7)
    s.box(-6, -8, 0, 12, 16, 16, (238, 232, 216))
    s.windows(-6, -8, 6, 12, 16, 10, step=2, zstep=3, c=(70, 110, 150), lit=0.7)
    x, y = s.P(6, 0, 12)
    s.d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(250, 250, 240, 255), outline=DARK + (255,))
    s.px(x, y - 1, DARK); s.px(x + 1, y, DARK)
    s.d.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 240, 200, 255))  # подсветка циферблата ночью
    s.de.ellipse([x - 3, y - 3, x + 3, y + 3], fill=(255, 240, 200, 255))
    for v in range(-24, 25, 8):
        s.lamp(12, v, 4)
    s.T(TR, True)
    # поезд
    tu = -17
    for i in range(6):
        v = -26 + i * 8 + s.f
        s.box(tu, v, 0, 4, 7, 3, (60, 110, 80) if i else (200, 60, 50))
        s.faceL(tu + 2, v + 7, 2, LIT, s.em)


def s_navoi_park(s):
    s.plate(28, 26, GRASS)
    s.water(-24, -22, 18, 22)
    s.rect(-4, -24, 6, 50, PATH)
    s.rect(-26, 8, 52, 5, PATH)
    s.flush()
    TR = s.trees_ring(28, 26, 40, margin=6, kinds=["round", "round", "autumn", "cone"])
    s.T(TR, False)
    s.flush()
    # ротонда памятника Навои
    s.shadow_round(10, -4, 7, 22); s.flush()
    s.cyl(10, -4, 0, 8, 2, STONE)
    for a in range(0, 360, 36):
        r = math.radians(a)
        u, v = 10 + math.cos(r) * 6.5, -4 + math.sin(r) * 6.5
        if math.cos(r) + math.sin(r) > -0.6:
            s.cyl(u, v, 2, 0.6, 12, WHITE)
    x, y = s.P(10, -4, 2)
    s.bitmap(int(x) - 2, int(y) - 10, ["  b  ", " bbb ", " bbb ", "bbbbb", " bbb ", " bbb ", " b b ", " b b "], {"b": BRONZE2})
    s.cyl(10, -4, 14, 7.4, 2, WHITE)
    s.dome(10, -4, 16, 6.6, (40, 120, 190), hk=0.85, ribs=6)
    s.T(TR, True)
    for u in range(-22, 23, 9):
        s.lamp(u, 7, 4)
    s.flush()


def s_japanese(s):
    s.plate(22, 20, GRASS)
    s.water(-14, -10, 18, 16)
    s.flush()
    TR = s.trees_ring(22, 20, 26, margin=4, kinds=["blossom", "round", "cone", "blossom", "autumn"])
    s.T(TR, False)
    s.flush()
    # мостик
    for i in range(10):
        x, y = s.P(-10 + i * 1.6, 2, 2 + math.sin(i / 9 * math.pi) * 2)
        s.d.rectangle([x - 1, y - 1, x + 1, y], fill=(190, 60, 40, 255))
    # пагода
    s.shadow_box(8, -14, 8, 8, 18); s.flush()
    for k, (z, r) in enumerate(((0, 4), (6, 3.5), (11, 3), (15, 2.5))):
        s.box(12 - r * 0.7, -10 - r * 0.7, z, r * 1.4, r * 1.4, 4, (210, 190, 160))
        s.box(12 - r, -10 - r, z + 4, r * 2, r * 2, 1, (70, 60, 56))
        s.windows(12 - r * 0.7, -10 - r * 0.7, z, r * 1.4, r * 1.4, 4, step=2, zstep=3, c=(150, 60, 40), lit=0.6, margin=0.5)
    x, y = s.P(12, -10, 20)
    for k in range(5): s.px(x, y - k, GOLD)
    # торий
    x, y = s.P(16, 12, 0)
    s.d.rectangle([x - 4, y - 8, x - 3, y], fill=(200, 50, 40, 255))
    s.d.rectangle([x + 3, y - 8, x + 4, y], fill=(200, 50, 40, 255))
    s.d.rectangle([x - 6, y - 10, x + 6, y - 9], fill=(170, 40, 34, 255))
    s.T(TR, True)
    s.flush()


def s_forums(s):
    s.plate(24, 22, PAVE)
    s.rect(8, -20, 14, 40, GRASS2)
    s.fountain(15, 0, 3)
    s.flush()
    s.shadow_box(-18, -16, 24, 32, 20); s.flush()
    s.box(-18, -16, 0, 24, 32, 12, WHITE)
    for v in range(-15, 16, 2):
        x, y = s.P(6, v, 0)
        for z in range(1, 11): s.faceR(6, v, z, (190, 196, 200))
        s.faceR(6, v, 5, LIT, s.em)
    for u in range(-17, 6, 2):
        for z in range(1, 11): s.faceL(u, 16, z, (200, 204, 208))
        if s.rnd.random() < 0.6: s.faceL(u, 16, 5, LIT2, s.em)
    s.box(-18.5, -16.5, 12, 25, 33, 1.5, MARBLE)
    s.cyl(-6, 0, 13, 7, 3, MARBLE)
    s.dome(-6, 0, 16, 6.5, (60, 120, 200), hk=1.05, ribs=0)
    for v in (-14, 14):
        s.lamp(10, v, 5)
    s.flush()


def s_new_tashkent(s):
    """Новый Ташкент — большая стройка: краны, каркасы, первые башни."""
    DIRT = (168, 140, 100); DIRT2 = (150, 122, 86); ASPH = (92, 90, 92)
    s.plate(36, 32, DIRT, edge=(120, 96, 66))
    for i in range(160):
        u, v = s.rnd.uniform(-35, 35), s.rnd.uniform(-31, 31)
        x, y = s.P(u, v, 0); s.px(x, y, DIRT2)
    s.rect(-36, -3, 72, 6, ASPH)       # новая магистраль
    s.rect(-3, -32, 6, 64, ASPH)
    for u in range(-34, 35, 6):
        s.rect(u, -0.3, 3, 0.6, (220, 210, 150))
    s.rect(8, 8, 24, 20, GRASS2)       # будущий парк
    s.water(14, 12, 12, 9)
    s.flush()
    TR = [(10 + (i % 6) * 4, 9 + (i // 6) * 5, 1.6, "round") for i in range(18) if not (13 <= 10 + (i % 6) * 4 <= 27 and 11 <= 9 + (i // 6) * 5 <= 22)]
    s.T(TR, False)
    # готовые башни (стекло)
    towers = [(-30, -28, 7, 7, 42, (96, 140, 168)), (-20, -28, 6, 6, 30, (130, 160, 176)), (-30, -18, 6, 7, 24, (150, 170, 184))]
    for t in towers: s.shadow_box(t[0], t[1], t[2], t[3], t[4] * 0.6)
    s.flush()
    for u, v, du, dv, h, c in towers:
        s.box(u, v, 0, du, dv, h, c, top=mul(c, 1.25))
        s.windows(u, v, 0, du, dv, h, step=2, zstep=2, c=mul(c, 1.25), lit=0.5, margin=0.5)
    # каркасы строящихся зданий: колонны и перекрытия
    frames = [(8, -28, 10, 8, 4), (8, -16, 8, 8, 3), (-28, 8, 12, 9, 5), (-14, 10, 8, 8, 2)]
    for u, v, du, dv, fl in frames:
        for f in range(fl + 1):
            z = f * 4
            s.box(u, v, z, du, dv, 0.8, (176, 172, 166), outline=False)
            if f < fl:
                for cu in range(0, int(du) + 1, 3):
                    for cv in (0, dv):
                        s.box(u + cu, v + cv - 0.5 if cv else v, z + 0.8, 0.8, 0.8, 3.2, (150, 146, 140), outline=False)
                for cv in range(0, int(dv) + 1, 3):
                    s.box(u + du - 0.8, v + cv, z + 0.8, 0.8, 0.8, 3.2, (150, 146, 140), outline=False)
        x, y = s.P(u + du / 2, v + dv / 2, fl * 4 + 1)
        s.px(x, y, (255, 120, 40)); s.px(x, y, (255, 160, 60, 255), s.em)   # сигнальный огонь
    # башенные краны
    for (u, v, h, ang) in ((2, -24, 52, 0), (-12, 4, 44, 1)):
        x0, y0 = s.P(u, v, 0)
        for k in range(h):
            s.px(x0, y0 - k, (230, 180, 40)); s.px(x0 + 1, y0 - k, (190, 140, 30) if k % 3 else (120, 90, 20))
        top = y0 - h
        L = 22; back = 7
        dirx = -1 if ang else 1
        for k in range(-back, L):
            s.px(x0 + dirx * k, top + (k * 0.25 if ang else -k * 0.25) * 0 , (230, 180, 40))
            if k % 3 == 0: s.px(x0 + dirx * k, top + 1, (190, 140, 30))
        s.d.rectangle([x0 - dirx * back - 2, top, x0 - dirx * back + 1, top + 3], fill=(110, 110, 110, 255))  # противовес
        s.d.rectangle([x0 - 1, top - 3, x0 + 2, top - 1], fill=(200, 60, 40, 255))                          # кабина
        hk = 10 + (6 if s.f else 0)                                                                         # крюк ездит
        hx = x0 + dirx * hk
        drop = 14 + (4 if s.f else 0)
        for k in range(drop): s.px(hx, top + 1 + k, (60, 60, 60))
        s.d.rectangle([hx - 2, top + drop, hx + 2, top + drop + 2], fill=(150, 146, 140, 255))
        s.px(x0, top - 4, (255, 60, 40)); s.px(x0, top - 4, (255, 70, 50, 255), s.em)
    # экскаватор и самосвал
    s.box(20, -12, 0, 4, 3, 2, (230, 180, 40)); s.box(21, -11, 2, 2, 2, 2, (40, 40, 44))
    s.box(-24, 22, 0, 6, 3, 2.5, (200, 70, 50)); s.box(-19, 22, 0, 2, 3, 3, (60, 60, 64))
    s.T(TR, True)
    for u in range(-32, 33, 8):
        s.lamp(u, 4, 5)
    s.flush()


SPRITES = {
    "amir_temur": s_amir_temur, "tv_tower": s_tv_tower, "hazrati_imam": s_hazrati_imam,
    "chorsu": s_chorsu, "minor": s_minor, "mustaqillik": s_mustaqillik,
    "navoi_theatre": s_navoi_theatre, "kukeldash": s_kukeldash, "magic_city": s_magic_city,
    "temurid": s_temurid, "hotel_uz": s_hotel_uz, "tashkent_city": s_tashkent_city,
    "romanov": s_romanov, "applied_arts": s_applied_arts, "courage": s_courage,
    "pakhtakor": s_pakhtakor, "station": s_station, "navoi_park": s_navoi_park,
    "japanese": s_japanese, "forums": s_forums, "new_tashkent": s_new_tashkent,
}


def render(name, fn):
    frames = []
    for f in (0, 1):
        s = Spr(f, seed=hash(name) & 0xffff)
        s.rnd = random.Random(sum(map(ord, name)))
        fn(s)
        s.flush()
        frames.append((s.img, s.em, s.ox, s.oy))
    # общий bbox по всем слоям
    box = None
    for img, em, _, _ in frames:
        for b in (img.getbbox(), em.getbbox()):
            if not b: continue
            box = b if not box else (min(box[0], b[0]), min(box[1], b[1]), max(box[2], b[2]), max(box[3], b[3]))
    x0, y0, x1, y1 = box
    x0 -= 1; y0 -= 1; x1 += 1; y1 += 1
    w, h = x1 - x0, y1 - y0
    sheet = Image.new("RGBA", (w * 2, h * 2), (0, 0, 0, 0))
    for i, (img, em, ox, oy) in enumerate(frames):
        sheet.paste(img.crop((x0, y0, x1, y1)), (i * w, 0))
        sheet.paste(em.crop((x0, y0, x1, y1)), (i * w, h))
    sheet.save(os.path.join(OUT, name + ".png"), optimize=True)
    ox, oy = frames[0][2], frames[0][3]
    # грубая маска для попадания курсором (ячейки 3x3 px), строки из 0/1
    day = frames[0][0].crop((x0, y0, x1, y1)).getchannel("A")
    C = 3
    rows = []
    for yy in range(0, h, C):
        r = ""
        for xx in range(0, w, C):
            b = day.crop((xx, yy, min(w, xx + C), min(h, yy + C))).getbbox()
            r += "1" if b else "0"
        rows.append(r)
    return {"w": w, "h": h, "ax": ox - x0, "ay": oy - y0, "mc": C, "mask": rows}


def main():
    os.makedirs(OUT, exist_ok=True)
    meta = {}
    for name, fn in SPRITES.items():
        meta[name] = render(name, fn)
        print(f"{name:14s} {meta[name]}")
    with open(os.path.join(ROOT, "js", "sprites-meta.js"), "w", encoding="utf-8") as fh:
        fh.write("// Сгенерировано tools/gen_sprites.py — размеры кадров и точки привязки спрайтов\n")
        fh.write("window.SPRITE_UNIT_M = %s;\n" % UNIT_M)
        fh.write("window.SPRITES_META = " + json.dumps(meta, ensure_ascii=False) + ";\n")


if __name__ == "__main__":
    main()
