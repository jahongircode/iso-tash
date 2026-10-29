#!/usr/bin/env python3
"""
Запекание данных города в компактные бинарные тайлы для сайта.

Источники:
  raw/14_x_y.pbf      — векторные тайлы OpenStreetMap (OpenFreeMap): земля, вода, дороги, места
  osm/bld/b_*.json    — здания OSM (Overpass): контуры, этажность, высота, крыши, цвета
  osm/extra.json      — светофоры и отдельные деревья (Overpass), если есть

Результат:
  data/t/X_Y.js       — тайл: TPM_TILE(X, Y, "base64") (работает и при открытии с диска)
  data/index.js       — список тайлов и начало координат

Запуск: python tools/bake/bake.py RAW_DIR OSM_DIR OUT_DATA_DIR
"""
import base64, glob, json, math, os, re, sys, zlib
from collections import defaultdict
import numpy as np
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(__file__))
import mvt
from palette import roof_color, wall_color

RAW, OSM, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
Z = 14
LAT0, LNG0 = 41.3111, 69.2797
def gx(lng): return (lng + 180) / 360 * 256
def gy(lat):
    s = math.sin(math.radians(lat)); return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 256
MPU = 40075016.686 * math.cos(math.radians(LAT0)) / 256
SIZE = 256 / 2 ** Z
TILE_M = SIZE * MPU  # ~1837 м

# ---------------- классы ----------------
LU = {"residential": 0, "commercial": 1, "retail": 1, "industrial": 2, "garages": 2, "railway": 2, "quarry": 2, "dam": 2,
      "cemetery": 7, "school": 10, "university": 10, "college": 10, "hospital": 10, "kindergarten": 10, "library": 10,
      "stadium": 9, "pitch": 9, "track": 9, "playground": 14, "military": 16, "theme_park": 3, "zoo": 3}
LC = {"grass": 3, "wood": 4, "farmland": 5, "sand": 6, "rock": 6, "ice": 6, "wetland": 11}
RD = {"motorway": 0, "trunk": 1, "primary": 2, "secondary": 3, "tertiary": 4, "minor": 5, "service": 6, "track": 7,
      "path": 8, "rail": 9, "transit": 10, "busway": 6}
WW = {"river": 13, "canal": 14, "stream": 15, "drain": 15, "ditch": 15}

# ошибки разметки OSM: стопки building:part без min_height, которых в городе нет (lat, lng, радиус м)
BOGUS_PARTS = [(41.31918, 69.25564, 15)]  # «обелиск» 172 м к северу от Tashkent City
ROAD_W = {0: 24, 1: 22, 2: 18, 3: 14, 4: 11, 5: 7.5, 6: 4.5, 7: 3, 8: 2.5, 9: 4, 10: 3, 11: 45, 12: 20, 13: 22, 14: 9, 15: 3}

# ---------------- двоичная запись ----------------
class W:
    def __init__(self): self.b = bytearray()
    def u8(self, v): self.b.append(v & 255)
    def var(self, v):
        v = int(v)
        while True:
            c = v & 0x7f; v >>= 7
            if v: self.b.append(c | 0x80)
            else: self.b.append(c); return
    def svar(self, v): v = int(v); self.var((v << 1) ^ (v >> 63) if v < 0 else v << 1)
    def u24(self, v): self.b += bytes([(v >> 16) & 255, (v >> 8) & 255, v & 255])
    def pts(self, pts):
        self.var(len(pts)); px = py = 0
        for x, y in pts:
            x = int(round(x)); y = int(round(y)); self.svar(x - px); self.svar(y - py); px, py = x, y
    def s(self, txt): b = txt.encode("utf-8"); self.var(len(b)); self.b += b

def zz_ok(): assert True

# ---------------- геометрия ----------------
def area(r):
    a = 0
    for i in range(len(r) - 1): a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]
    return a / 2
def clip_poly(r, lo, hi):
    # Сазерленд–Ходжман по квадрату [lo,hi]
    def cl(pts, inside, inter):
        out = []
        for i in range(len(pts)):
            a, b = pts[i - 1], pts[i]
            ia, ib = inside(a), inside(b)
            if ib:
                if not ia: out.append(inter(a, b))
                out.append(b)
            elif ia: out.append(inter(a, b))
        return out
    pts = r[:-1] if r and r[0] == r[-1] else r[:]
    for k, v, side in ((0, lo, 1), (0, hi, -1), (1, lo, 1), (1, hi, -1)):
        if not pts: return []
        ins = (lambda p, k=k, v=v, s=side: (p[k] - v) * s >= 0)
        def inter(a, b, k=k, v=v):
            t = (v - a[k]) / ((b[k] - a[k]) or 1e-9)
            return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
        pts = cl(pts, ins, inter)
    return pts
def clip_line(pts, lo, hi, out):
    cur = None
    for i in range(len(pts) - 1):
        (x0, y0), (x1, y1) = pts[i], pts[i + 1]
        dx, dy = x1 - x0, y1 - y0; t0, t1 = 0.0, 1.0; ok = True
        for p, q in ((-dx, x0 - lo), (dx, hi - x0), (-dy, y0 - lo), (dy, hi - y0)):
            if p == 0:
                if q < 0: ok = False; break
            else:
                r = q / p
                if p < 0:
                    if r > t1: ok = False; break
                    t0 = max(t0, r)
                else:
                    if r < t0: ok = False; break
                    t1 = min(t1, r)
        if not ok:
            if cur and len(cur) > 1: out.append(cur)
            cur = None; continue
        a = (x0 + dx * t0, y0 + dy * t0); b = (x0 + dx * t1, y0 + dy * t1)
        if cur is None or t0 > 0:
            if cur and len(cur) > 1: out.append(cur)
            cur = [a]
        cur.append(b)
        if t1 < 1:
            out.append(cur); cur = None
    if cur and len(cur) > 1: out.append(cur)
def simplify(pts, eps):
    if len(pts) < 3: return pts
    keep = [False] * len(pts); keep[0] = keep[-1] = True
    if pts[0] == pts[-1]:  # замкнутое кольцо: делим пополам, иначе базовый отрезок нулевой
        m = len(pts) // 2; keep[m] = True; st = [(0, m), (m, len(pts) - 1)]
    else:
        st = [(0, len(pts) - 1)]
    while st:
        a, b = st.pop(); ax, ay = pts[a]; bx, by = pts[b]; dx, dy = bx - ax, by - ay; L = math.hypot(dx, dy) or 1e-9
        md, mi = 0, -1
        for i in range(a + 1, b):
            d = abs((pts[i][0] - ax) * dy - (pts[i][1] - ay) * dx) / L
            if d > md: md, mi = d, i
        if md > eps and mi > 0: keep[mi] = True; st += [(a, mi), (mi, b)]
    return [p for p, k in zip(pts, keep) if k]

# ---------------- здания OSM ----------------
def parse_len(v):
    if not v: return None
    m = re.match(r"^\s*([0-9]+(?:[.,][0-9]+)?)", str(v))
    return float(m.group(1).replace(",", ".")) if m else None
NAMED = {"white": 0xEEEEE8, "red": 0xB84A3A, "brown": 0x8A5A3C, "grey": 0x9A9A98, "gray": 0x9A9A98, "green": 0x5E8A5A,
         "blue": 0x4A78A8, "yellow": 0xE0C060, "beige": 0xD8C8A0, "black": 0x333333, "orange": 0xD88040, "maroon": 0x7A3A30,
         "silver": 0xC0C0C0, "darkgreen": 0x2F5A36, "lightgrey": 0xC8C8C8, "tan": 0xC8A878, "cream": 0xEDE3C8}
def col(v):
    if not v: return -1
    v = v.strip().lower()
    m = re.match(r"^#?([0-9a-f]{6})$", v)
    if m: return int(m.group(1), 16)
    m = re.match(r"^#([0-9a-f]{3})$", v)
    if m: return int("".join(c * 2 for c in m.group(1)), 16)
    return NAMED.get(v, -1)
KIND = {"house": 1, "detached": 1, "semidetached_house": 1, "terrace": 1, "bungalow": 1, "residential": 1, "hut": 1, "farm": 1,
        "apartments": 2, "dormitory": 2, "commercial": 3, "office": 3, "retail": 3, "supermarket": 3, "hotel": 3, "mall": 3,
        "industrial": 4, "warehouse": 4, "factory": 4, "service": 4, "hangar": 4, "garages": 9, "garage": 9, "shed": 9, "roof": 9,
        "mosque": 5, "school": 6, "university": 6, "college": 6, "hospital": 6, "kindergarten": 6, "public": 6, "government": 6,
        "civic": 6, "train_station": 6, "stadium": 6, "sports_hall": 6, "minaret": 7, "tower": 7, "church": 8, "cathedral": 8}
ROOF = {"flat": 0, "gabled": 1, "hipped": 2, "pyramidal": 3, "dome": 4, "onion": 5, "skillion": 6, "half-hipped": 2, "mansard": 2}

def rings_from_rel(mem):
    segs = [m["g"] for m in mem if m["r"] in ("outer", "")]
    out = []
    while segs:
        ring = segs.pop()
        grown = True
        while ring[0] != ring[-1] and grown:
            grown = False
            for i, s in enumerate(segs):
                if s[0] == ring[-1]: ring = ring + s[1:]
                elif s[-1] == ring[-1]: ring = ring + s[::-1][1:]
                elif s[-1] == ring[0]: ring = s + ring[1:]
                elif s[0] == ring[0]: ring = s[::-1] + ring[1:]
                else: continue
                segs.pop(i); grown = True; break
        if ring[0] == ring[-1] and len(ring) >= 4: out.append(ring)
    return out

def load_buildings():
    seen = set(); outl = []; parts = []
    for f in glob.glob(os.path.join(OSM, "bld", "b_*.json")):
        for el in json.load(open(f)):
            if el["id"] in seen: continue
            seen.add(el["id"])
            rings = [el["g"]] if "g" in el else rings_from_rel(el.get("m", []))
            for r in rings:
                if len(r) < 4 or r[0] != r[-1]: continue
                (parts if "building:part" in el["t"] and "building" not in el["t"] else outl).append((r, el["t"], el["id"]))
    return outl, parts

def bld_props(t, a_m2, hsh):
    btype = t.get("building") or t.get("building:part") or "yes"
    kind = KIND.get(btype, 0)
    if t.get("amenity") == "place_of_worship":
        kind = 5 if t.get("religion", "muslim") == "muslim" else 8
    lv = parse_len(t.get("building:levels") or t.get("levels"))
    h = parse_len(t.get("height"))
    rl = parse_len(t.get("roof:levels")) or 0
    if h is None and lv is not None: h = lv * 3.1 + rl * 2.2 + 0.6
    minh = parse_len(t.get("min_height"))
    if minh is None and parse_len(t.get("building:min_level")) is not None: minh = parse_len(t.get("building:min_level")) * 3.1
    minh = minh or 0
    if h is None:
        r = hsh % 100
        if kind == 1: h = 3.4 if (a_m2 < 160 or r < 70) else 6.4
        elif kind == 2: h = [13.0, 16.0, 16.0, 28.5][hsh % 4] if a_m2 > 300 else 10.0
        elif kind == 3: h = 7.0 if a_m2 < 400 else 10.5
        elif kind == 4: h = 7.5
        elif kind == 9: h = 2.8
        elif kind == 5: h = 9.0
        elif kind == 6: h = 10.0
        elif kind == 7: h = 30.0
        else:
            if a_m2 < 50: h = 2.8
            elif a_m2 < 260: h = 3.4 if r < 80 else 6.4  # частные дома махаллей — в основном одноэтажные
            elif a_m2 < 700: h = 6.4 if r < 60 else 9.6
            elif a_m2 < 2500: h = [9.6, 13.0, 16.0, 28.5][hsh % 4]
            else: h = 8.0
    h = max(h, minh + 1.0)
    # крыша
    rs = t.get("roof:shape")
    roof = ROOF.get(rs, -1)
    if roof < 0:
        if kind == 5: roof = 4
        elif kind == 7: roof = 3
        elif kind == 8: roof = 1
        elif (kind in (0, 1, 9)) and a_m2 < 420 and h <= 7.5: roof = 2 if hsh % 10 < 6 else 1
        else: roof = 0
    # открытые стадионы из OSM — чаша с трибунами (крытые арены оставляем коробкой с куполом/плоской крышей)
    if btype == "stadium" and a_m2 > 4000 and t.get("roof:shape") in (None, "flat", "none") and t.get("covered") != "yes":
        roof = 7; h = min(max(h if (t.get("height") or t.get("building:levels")) else 12.0, 8.0), 30.0)
    wall = col(t.get("building:colour"))
    if wall < 0: wall = wall_color(kind, h, a_m2, hsh)
    rc = col(t.get("roof:colour"))
    if rc < 0: rc = roof_color(kind, roof, h, a_m2, hsh)
    return kind, h, minh, roof, wall, rc

# ---------------- достопримечательности ----------------
def m_of(la, lo): return ((gx(lo) - gx(LNG0)) * MPU, (gy(la) - gy(LAT0)) * MPU)
def obb_m(pts):
    best = None; n = len(pts)
    for i in range(n):
        (x0, z0), (x1, z1) = pts[i], pts[(i + 1) % n]
        L = math.hypot(x1 - x0, z1 - z0)
        if L < 0.5: continue
        ux, uz = (x1 - x0) / L, (z1 - z0) / L
        a = [p[0] * ux + p[1] * uz for p in pts]; b = [-p[0] * uz + p[1] * ux for p in pts]
        ar = (max(a) - min(a)) * (max(b) - min(b))
        if best is None or ar < best[0]: best = (ar, ux, uz, min(a), max(a), min(b), max(b))
    _, ux, uz, a0, a1, b0, b1 = best
    if b1 - b0 > a1 - a0: ux, uz, a0, a1, b0, b1 = -uz, ux, b0, b1, -a1, -a0
    ca, cb = (a0 + a1) / 2, (b0 + b1) / 2
    return {"x": round(ca * ux - cb * uz, 2), "z": round(ca * uz + cb * ux, 2), "ang": round(math.atan2(uz, ux), 4), "L": round(a1 - a0, 2), "W": round(b1 - b0, 2)}
def in_obb(o, x, z):
    dx, dz = x - o["x"], z - o["z"]; c, s_ = math.cos(o["ang"]), math.sin(o["ang"])
    return abs(dx * c + dz * s_) <= o["L"] / 2 + o["m"] and abs(-dx * s_ + dz * c) <= o["W"] / 2 + o["m"]
def resolve_landmarks(outl):
    spec = json.load(open(os.path.join(os.path.dirname(__file__), "landmarks_spec.json")))
    byid = {oid: (r, t) for r, t, oid in outl}
    geo = {}; hide = set(); polys = []
    for sp in spec:
        o = None
        if sp.get("osm") in byid:
            r, t = byid[sp["osm"]]
            o = obb_m([m_of(la, lo) for la, lo in r[:-1]])
            o["h"] = parse_len(t.get("height")) or ((parse_len(t.get("building:levels")) or 0) * 3.1) or 0
            if not sp.get("keep"): hide.add(sp["osm"])
        elif sp.get("poly"):  # контур задан прямо в спецификации (напр. leisure=stadium, которого нет среди зданий)
            o = obb_m([m_of(la, lo) for la, lo in sp["poly"][:-1]]); o["h"] = 0
        elif sp.get("pt"):
            x, z = m_of(*sp["pt"]); o = {"x": round(x, 2), "z": round(z, 2), "ang": 0.0, "L": 0, "W": 0, "h": 0}
        elif sp.get("parts"):  # комплекс из нескольких корпусов: модель строится по их контурам
            o = obb_m([m_of(la, lo) for pt in sp["parts"] for la, lo in pt["p"]]); o["h"] = 0
            o["parts"] = [{"h": pt["h"], "mh": pt.get("mh", 0), "p": [[round(v, 1) for v in m_of(la, lo)] for la, lo in pt["p"]]} for pt in sp["parts"]]
            for pt in sp["parts"]:  # прячем здания OSM под каждым корпусом
                q = obb_m([m_of(la, lo) for la, lo in pt["p"]]); q["m"] = sp.get("part_clear", 1.5); polys.append(q)
        if not o: print("landmark not found:", sp["id"]); continue
        if sp.get("pt2"): x2, z2 = m_of(*sp["pt2"]); o["x2"] = round(x2, 2); o["z2"] = round(z2, 2)
        if sp.get("extra_parts"):  # дополнительные корпуса той же модели (напр. вторая башня курантов)
            o["parts"] = [{"h": pt["h"], "p": [[round(v, 1) for v in m_of(la, lo)] for la, lo in pt["p"]]} for pt in sp["extra_parts"]]
            for pt in sp["extra_parts"]:
                q = obb_m([m_of(la, lo) for la, lo in pt["p"]]); q["m"] = sp.get("part_clear", 1.5); polys.append(q)
        if sp.get("entrance"): ex, ez = m_of(*sp["entrance"]); o["ex"] = round(ex, 2); o["ez"] = round(ez, 2)
        if sp.get("sub"): o["sub"] = {k: [round(v, 2) for v in m_of(*ll)] for k, ll in sp["sub"].items()}  # опорные точки частей модели
        la, lo = sp.get("pt") or (None, None)
        for hid in sp.get("hide", []): hide.add(hid)  # здания OSM, которые заменяет модель
        geo[sp["id"]] = o
        if sp.get("clear") is not None and sp.get("clear") != 0 and not sp.get("keep"):
            q = dict(o); q["m"] = sp["clear"]
            if q["L"] == 0: q["L"] = q["W"] = 0
            polys.append(q)
    return geo, hide, polys

# ---------------- главный цикл ----------------
def main():
    os.makedirs(os.path.join(OUT, "t"), exist_ok=True)
    print("loading buildings…", flush=True)
    outl, parts = load_buildings()
    def bogus(r):
        la = sum(p[0] for p in r[:-1]) / (len(r) - 1); lo = sum(p[1] for p in r[:-1]) / (len(r) - 1)
        return any(math.hypot((la - bl) * 111320, (lo - bo) * 111320 * math.cos(math.radians(bl))) < br for bl, bo, br in BOGUS_PARTS)
    parts = [p for p in parts if not bogus(p[0])]
    print(len(outl), "outlines", len(parts), "parts", flush=True)
    extra = json.load(open(os.path.join(OSM, "extra.json"))) if os.path.exists(os.path.join(OSM, "extra.json")) else {}
    lm_geo, hide_ids, lm_polys = resolve_landmarks(outl)

    # раскладываем здания по тайлам (по центру)
    by_tile = defaultdict(list)
    def tile_of(lat, lng): return int(gx(lng) / SIZE), int(gy(lat) / SIZE)
    # контуры, внутри которых есть building:part, скрываем (как в Simple 3D Buildings)
    grid = defaultdict(list)
    def cen(r): return sum(p[0] for p in r[:-1]) / (len(r) - 1), sum(p[1] for p in r[:-1]) / (len(r) - 1)
    for i, (r, t, _) in enumerate(outl):
        la, lo = cen(r); grid[(int(la * 500), int(lo * 500))].append(i)
    hidden = set()
    def pip(r, la, lo):
        ins = False
        for i in range(len(r) - 1):
            (a1, o1), (a2, o2) = r[i], r[i + 1]
            if (a1 > la) != (a2 > la) and lo < (o2 - o1) * (la - a1) / ((a2 - a1) or 1e-12) + o1: ins = not ins
        return ins
    for r, t, _ in parts:
        la, lo = cen(r)
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for i in grid.get((int(la * 500) + a, int(lo * 500) + b), []):
                    if i not in hidden and pip(outl[i][0], la, lo): hidden.add(i)
    allb = [b for i, b in enumerate(outl) if i not in hidden] + parts
    print("hidden outlines:", len(hidden), flush=True)
    for r, t, oid in allb:
        if oid in hide_ids: continue
        la, lo = cen(r)
        mx, mz = (gx(lo) - gx(LNG0)) * MPU, (gy(la) - gy(LAT0)) * MPU
        if any(in_obb(o, mx, mz) for o in lm_polys): continue
        by_tile[tile_of(la, lo)].append((r, t, oid))
    sig_by = defaultdict(list); tree_by = defaultdict(list)
    for la, lo in extra.get("signals", []): sig_by[tile_of(la, lo)].append((la, lo))
    for la, lo in extra.get("trees", []): tree_by[tile_of(la, lo)].append((la, lo))

    index = []
    stats = defaultdict(int)
    # мини-карта: север вверху, 1 px = MM_M метров
    MM_M = 40.0; BX0, BX1, BZ0, BZ1 = -16500, 37000, -17500, 20000
    MW, MH = int((BX1 - BX0) / MM_M), int((BZ1 - BZ0) / MM_M)
    mm = Image.new("RGB", (MW, MH), (136, 130, 102)); md = ImageDraw.Draw(mm)
    MMC = {0: (150, 142, 122), 1: (160, 154, 144), 2: (128, 124, 116), 3: (104, 140, 70), 4: (78, 112, 54), 5: (128, 132, 80), 6: (176, 160, 120),
           7: (100, 120, 80), 8: (70, 130, 170), 9: (96, 146, 70), 10: (150, 142, 122), 11: (90, 126, 98), 12: (120, 120, 118), 13: (120, 122, 100),
           14: (150, 140, 110), 16: (120, 124, 100), 17: (96, 138, 64)}
    files = sorted(glob.glob(os.path.join(RAW, "14_*.pbf")))
    for fi, f in enumerate(files):
        _, x, y = os.path.basename(f)[:-4].split("_"); x, y = int(x), int(y)
        L = mvt.decode(open(f, "rb").read())
        ext = (L.get("transportation") or L.get("water") or {"extent": 4096})["extent"]
        k = TILE_M * 10 / ext  # дм на единицу MVT
        LIM = TILE_M * 10
        ox, oy = x * SIZE, y * SIZE
        def ll2(la, lo): return ((gx(lo) - ox) * MPU * 10, (gy(la) - oy) * MPU * 10)
        w = W()
        # ---- земля ----
        areas = []
        def addpoly(cls, rings):
            rr = []
            for r in rings:
                pts = [(px * k, py * k) for px, py in r]
                c = clip_poly(pts, 0, LIM)
                if len(c) >= 3:
                    c = simplify(c + [c[0]], 6)[:-1]
                    if len(c) >= 3: rr.append(c)
            if rr: areas.append((cls, rr))
        for name, m in (("landuse", LU), ("landcover", LC)):
            for typ, p, g in (L.get(name) or {"features": []})["features"]:
                if typ != 3: continue
                c = m.get(p.get("class"))
                if c is None: continue
                if name == "landcover" and p.get("class") == "grass" and p.get("subclass") in ("park", "garden", "recreation_ground", "village_green"): c = 17
                addpoly(c, g)
        for typ, p, g in (L.get("park") or {"features": []})["features"]:
            if typ == 3: addpoly(17, g)
        for typ, p, g in (L.get("aeroway") or {"features": []})["features"]:
            if typ == 3: addpoly(13 if p.get("class") == "aerodrome" else 12, g)
        for typ, p, g in (L.get("water") or {"features": []})["features"]:
            if typ == 3 and p.get("brunnel") != "tunnel": addpoly(8, g)
        # порядок: крупное и «нижнее» раньше
        ORDER = [5, 13, 0, 1, 2, 16, 10, 7, 9, 14, 6, 11, 12, 3, 17, 4, 8]
        areas.sort(key=lambda a: ORDER.index(a[0]) if a[0] in ORDER else 99)
        w.u8(1); w.var(len(areas))
        for cls, rr in areas:
            w.u8(cls); w.var(len(rr))
            for r in rr: w.pts(r)
        tox, toz = (x * SIZE - gx(LNG0)) * MPU, (y * SIZE - gy(LAT0)) * MPU
        def MP(px, py): return ((px / 10 + tox - BX0) / MM_M, (py / 10 + toz - BZ0) / MM_M)
        for cls, rr in areas:
            for r in rr:
                if len(r) >= 3: md.polygon([MP(*p) for p in r], fill=MMC.get(cls, (140, 134, 112)))
        # ---- линии ----
        lines = []
        for typ, p, g in (L.get("transportation") or {"features": []})["features"]:
            if typ != 2: continue
            c = RD.get(p.get("class"))
            if c is None: continue
            tun = p.get("brunnel") == "tunnel"
            if tun and c > 6: continue  # подземные ж/д и метро не рисуем; автомобильные тоннели — да (флаг 8)
            if c == 9 and p.get("subclass") in ("subway", "funicular"): continue
            if c == 9 and p.get("subclass") in ("tram", "light_rail"): c = 10
            ow = p.get("oneway"); fl = 0
            if ow in (1, "1"): fl |= 1
            if p.get("brunnel") == "bridge": fl |= 2
            if tun: fl |= 8
            try: lay = int(p.get("layer") or 0)
            except (TypeError, ValueError): lay = 0
            if lay >= 2 and fl & 2: fl |= 16  # второй ярус развязки
            if p.get("ramp"): fl |= 4
            for l in g:
                pts = [(px * k, py * k) for px, py in l]
                if ow in (-1, "-1"): pts = pts[::-1]; fl |= 1
                out = []; clip_line(pts, 0, LIM, out)
                for o in out:
                    o = simplify(o, 3)
                    if len(o) >= 2: lines.append((c, fl, o))
        for typ, p, g in (L.get("aeroway") or {"features": []})["features"]:
            if typ != 2: continue
            for l in g:
                out = []; clip_line([(px * k, py * k) for px, py in l], 0, LIM, out)
                for o in out: lines.append((11 if p.get("class") == "runway" else 12, 0, o))
        for typ, p, g in (L.get("waterway") or {"features": []})["features"]:
            c = WW.get(p.get("class"))
            if c is None or p.get("brunnel") == "tunnel": continue
            for l in g:
                out = []; clip_line([(px * k, py * k) for px, py in l], 0, LIM, out)
                for o in out: lines.append((c, 0, simplify(o, 4)))
        for c, fl, o in lines:
            if c <= 3 or c in (13, 14): md.line([MP(*p) for p in o], fill=(70, 130, 170) if c >= 13 else (226, 218, 196), width=2 if c <= 1 else 1)
        w.u8(2); w.var(len(lines))
        for c, fl, o in lines: w.u8(c); w.u8(fl); w.pts(o)
        # ---- здания ----
        blds = []
        for r, t, oid in by_tile.get((x, y), []):
            pts = [ll2(la, lo) for la, lo in r[:-1]]
            pts = simplify(pts + [pts[0]], 2)[:-1]
            if len(pts) < 3: continue
            a = area(pts + [pts[0]]) / 100
            if a < 0: pts = pts[::-1]; a = -a  # единая ориентация
            if a < 6: continue
            hsh = (int(abs(hash(oid))) * 2654435761) & 0xffffffff
            kind, h, minh, roof, wall, rc = bld_props(t, a, hsh)
            # высота конька
            bw = math.sqrt(a)
            rh = 0
            if roof in (1, 2, 3): rh = max(1.2, min(4.5, bw * 0.22))
            if roof in (4, 5): rh = max(3.0, min(14.0, bw * 0.45))
            blds.append((pts, kind, h, minh, roof, rh, wall, rc))
        for pts, kind, h, *_ in blds:
            cx_ = sum(p[0] for p in pts) / len(pts); cz_ = sum(p[1] for p in pts) / len(pts)
            X, Y = MP(cx_, cz_)
            md.point((X, Y), fill=(92, 84, 76) if h < 8 else (220, 214, 200))
        w.u8(3); w.var(len(blds))
        for pts, kind, h, minh, roof, rh, wall, rc in blds:
            w.var(int(h * 10)); w.var(int(minh * 10)); w.u8(roof); w.var(int(rh * 10)); w.u24(wall); w.u24(rc); w.u8(kind); w.pts(pts)
        stats["b"] += len(blds)
        # ---- деревья (растр 4 м) ----
        N = int(TILE_M / 4)
        sc = N / LIM
        zone = Image.new("L", (N, N), 0); zd = ImageDraw.Draw(zone)
        block = Image.new("L", (N, N), 0); bd = ImageDraw.Draw(block)
        DENS = {4: 60, 17: 34, 3: 7, 7: 26, 10: 14, 0: 8, 9: 0, 14: 10}
        for cls, rr in areas:
            d = DENS.get(cls)
            for r in rr:
                poly = [(px * sc, py * sc) for px, py in r]
                if cls == 8: bd.polygon(poly, fill=255)
                elif d: zd.polygon(poly, fill=d)
        small = Image.new("L", (N, N), 0); sd = ImageDraw.Draw(small)
        for pts, kind, h, *_ in blds:
            poly = [(px * sc, py * sc) for px, py in pts]
            bd.polygon(poly, fill=255)
            if h <= 7 and kind in (0, 1): sd.polygon(poly, fill=255)
        for c, fl, o in lines:
            if c in (8,): continue
            wpx = max(1, int(ROAD_W.get(c, 6) * sc * 10 + 1))
            bd.line([(px * sc, py * sc) for px, py in o], fill=255, width=wpx)
        Z_ = np.array(zone, dtype=np.float32) / 255.0
        Bk = np.array(block) > 0
        # дворы махаллей: вокруг одноэтажных домов
        S_ = np.array(small) > 0
        if S_.any():
            from numpy.lib.stride_tricks import sliding_window_view
            pad = np.pad(S_, 3)
            near = sliding_window_view(pad, (7, 7)).max(axis=(2, 3))
            Z_ = np.maximum(Z_, near * 0.12)
        rng = np.random.default_rng(x * 100003 + y)
        R = rng.random((N, N))
        m = (R < Z_) & ~Bk
        ys, xs = np.nonzero(m)
        trees = []
        jit = rng.random((len(xs), 3))
        for i in range(len(xs)):
            trees.append(((xs[i] + jit[i, 0]) / sc, (ys[i] + jit[i, 1]) / sc, jit[i, 2]))
        # вдоль улиц (чинары и тополя Ташкента)
        Bk2 = Bk.copy()
        for c, fl, o in lines:
            if c not in (2, 3, 4, 5) or (fl & 4): continue
            off = (ROAD_W[c] / 2 + 3.5) * 10; step = (9.5 if c <= 3 else 11.0) * 10
            acc = rng.random() * step
            for i in range(len(o) - 1):
                (x0, y0), (x1, y1) = o[i], o[i + 1]
                dx, dy = x1 - x0, y1 - y0; L2 = math.hypot(dx, dy)
                if L2 < 1: continue
                ux, uy = dx / L2, dy / L2
                t = acc
                while t < L2:
                    for side in (1, -1):
                        px, py = x0 + ux * t - uy * off * side, y0 + uy * t + ux * off * side
                        gx_, gy_ = int(px * sc), int(py * sc)
                        if 0 <= gx_ < N and 0 <= gy_ < N and not Bk2[gy_, gx_] and rng.random() < 0.82:
                            Bk2[gy_, gx_] = True
                            trees.append((px, py, 2.0 + rng.random() * 0.99 if c <= 3 and rng.random() < 0.3 else rng.random()))
                    t += step
                acc = (acc - L2) % step
        for la, lo in tree_by.get((x, y), []):
            px, py = ll2(la, lo); trees.append((px, py, rng.random()))
        w.u8(4); w.var(len(trees)); px0 = py0 = 0
        for px, py, r in trees:
            px, py = int(px), int(py); w.svar(px - px0); w.svar(py - py0); px0, py0 = px, py
            w.u8(int(r * 85) & 255)  # 0..255: вид и размер (выбирается в браузере по сезону)
        stats["trees"] += len(trees)
        # ---- светофоры ----
        sg = [ll2(la, lo) for la, lo in sig_by.get((x, y), [])]
        w.u8(5); w.pts(sg)
        # ---- названия мест ----
        pl = []
        for typ, p, g in (L.get("place") or {"features": []})["features"]:
            if typ != 1 or not g or not g[0]: continue
            gx0, gy0 = g[0][0]
            if not (0 <= gx0 < ext and 0 <= gy0 < ext): continue
            nm = p.get("name:ru") or p.get("name") or ""
            if not nm: continue
            cl = {"neighbourhood": 1, "quarter": 2, "suburb": 3, "hamlet": 4, "village": 5, "town": 6, "city": 7}.get(p.get("class"), 0)
            pl.append((cl, gx0 * k, gy0 * k, nm, p.get("name:latin") or ""))
        w.u8(6); w.var(len(pl))
        for cl, px, py, nm, lat in pl: w.u8(cl); w.svar(px); w.svar(py); w.s(nm); w.s(lat)
        w.u8(0)
        blob = zlib.compress(bytes(w.b), 9)
        if len(areas) + len(lines) + len(blds) == 0: continue
        b64 = base64.b64encode(blob).decode()
        open(os.path.join(OUT, "t", f"{x}_{y}.js"), "w").write(f'TPM_TILE({x},{y},"{b64}");\n')
        index.append([x, y, len(b64), len(blds)])
        if fi % 50 == 0: print(f"{fi}/{len(files)} tiles, {stats['b']} buildings, {stats['trees']} trees", flush=True)
    # дороги поверх домов ещё раз нечего — сохраняем мини-карту
    mm.save(os.path.join(OUT, "minimap.png"), optimize=True)
    open(os.path.join(OUT, "minimap.js"), "w").write("TPM_MINIMAP(" + json.dumps({"x0": BX0, "x1": BX1, "z0": BZ0, "z1": BZ1}) + ");\n")
    # районы
    areas_out = {"city": None, "districts": []}
    def relrings(mem):
        rr = rings_from_rel(mem); out = []
        for r in rr:
            pts = [m_of(la, lo) for la, lo in r]
            pts = simplify(pts, 15)
            if len(pts) >= 4: out.append([round(v, 1) for p in pts for v in p])
        return out
    byl = defaultdict(list)
    for a_ in extra.get("admin", []):
        rr = relrings(a_["m"])
        if not rr: continue
        if a_["lvl"] != "4" and not re.search(r"район|tuman", a_["name"] or "", re.I): continue
        item = {"name": a_["name"], "uz": a_["uz"], "rings": rr}
        if a_["lvl"] == "4" and not areas_out["city"]: areas_out["city"] = item
        else: byl[a_["lvl"]].append(item)
    for lv in ("6", "7", "5", "8"):
        if 6 <= len(byl.get(lv, [])) <= 25: areas_out["districts"] = byl[lv]; break
    # контуры районов и города на мини-карте
    def mmline(ring, col, w):
        pts = [((ring[i] - BX0) / MM_M, (ring[i + 1] - BZ0) / MM_M) for i in range(0, len(ring), 2)]
        md.line(pts + [pts[0]], fill=col, width=w)
    for d_ in areas_out["districts"]:
        for r in d_["rings"]: mmline(r, (226, 214, 180), 1)
    if areas_out["city"]:
        for r in areas_out["city"]["rings"]: mmline(r, (255, 236, 180), 3)
    mm.save(os.path.join(OUT, "minimap.png"), optimize=True)
    open(os.path.join(OUT, "areas.js"), "w").write("TPM_AREAS(" + json.dumps(areas_out, ensure_ascii=False, separators=(",", ":")) + ");\n")
    open(os.path.join(OUT, "lm.js"), "w").write("// Привязка 3D-моделей к контурам OSM (метры от сквера Амира Темура)\nTPM_LM(" + json.dumps(lm_geo, separators=(",", ":")) + ");\n")
    meta = {"z": Z, "origin": [LAT0, LNG0], "mpu": MPU, "tileM": TILE_M, "tiles": index}
    open(os.path.join(OUT, "index.js"), "w").write("// Сгенерировано tools/bake/bake.py\nTPM_INDEX(" + json.dumps(meta, separators=(",", ":")) + ");\n")
    tot = sum(i[2] for i in index)
    print(f"DONE {len(index)} tiles, {stats['b']} buildings, {stats['trees']} trees, {tot/1e6:.1f} MB", flush=True)

if __name__ == "__main__":
    main()
