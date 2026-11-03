# =====================================================================
#  Ташкентский ботанический сад им. Ф. Н. Русанова (65 га, Юнусабад).
#  В OSM он — сплошной «лес», на карте выходила равномерная рябь из крон.
#  Скрипт пересаживает сад как дендрарий: экспозиции по природным зонам
#  (Средняя Азия у входа, Северная Америка и Европа на севере и востоке,
#  Дальний Восток и флора Китая на юге), рощицы одной породы с газонными
#  полянами между ними, аллеи чинар и сакур вдоль главной оси, ивы у прудов,
#  отдельные «солитёры» на полянах. Земля сада — газон (класс 17).
#  Породы пишутся байтом вида 85..161 (см. SPECIES в js/tiles.js):
#      u8 = 85 + вид * 7 + размер (0..6)
#  Заодно прячет здания OSM под моделями сада (оранжереи, летняя сцена, вход).
#      python tools/bake/botanic.py data [--preview out.png] [--dry]
# =====================================================================
import base64, json, math, os, re, sys, zlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pitches import wvar, wsv, gx, gy, LAT0, LNG0, MPU, SIZE
from greenery import Dec, crown

TILES = [(11346, 6121), (11346, 6122)]
BOX = (2530, -4280, 3645, -3150)  # рамка сада, мировые м (x0, z0, x1, z1)
PINE, SPRUCE, METASEQ, CYPRESS, WILLOW, SAKURA, SHRUB, CHINAR, BIRCH, MAPLE, OAK = range(11)
GEN, POPLAR = "gen", "pop"  # обычное лиственное и тополь — старые коды
# радиус кроны по виду и размеру f (0..1) — как в js/tiles.js
def R_of(sp, f):
    if sp == GEN: return (6 + f * 7.5) * 0.35
    if sp == POPLAR: return 1.9
    hg = {PINE: 11 + f * 7, SPRUCE: 9 + f * 9, METASEQ: 15 + f * 9, CYPRESS: 6 + f * 6, WILLOW: 8 + f * 5, SAKURA: 4.5 + f * 2.5,
          SHRUB: 1.8 + f * 1.4, CHINAR: 15 + f * 6, BIRCH: 10 + f * 5, MAPLE: 7 + f * 5, OAK: 11 + f * 6}[sp]
    return hg * {PINE: 0.26, SPRUCE: 0.18, METASEQ: 0.12, CYPRESS: 0.09, WILLOW: 0.5, SAKURA: 0.48, SHRUB: 0.6, CHINAR: 0.33, BIRCH: 0.22, MAPLE: 0.34, OAK: 0.38}[sp]
SPACE = {PINE: 5.0, SPRUCE: 4.2, METASEQ: 4.0, CYPRESS: 2.4, WILLOW: 8.0, SAKURA: 5.0, SHRUB: 2.6, CHINAR: 9.0, BIRCH: 4.4, MAPLE: 5.5, OAK: 8.0, GEN: 5.5, POPLAR: 3.6}
# экспозиции: центр зоны и состав пород (вес)
ZONES = {
    "central_asia": ([(2700, -3790), (2620, -3960)], {CHINAR: 3, CYPRESS: 2, POPLAR: 1.5, OAK: 1, GEN: 1.5, SHRUB: 1}),
    "north_america": ([(2960, -4130), (3260, -4160)], {METASEQ: 2, SPRUCE: 2, MAPLE: 2.5, OAK: 2, PINE: 1}),
    "europe": ([(3480, -3820), (3440, -4060)], {PINE: 3, BIRCH: 2.5, OAK: 2, SPRUCE: 1.5, MAPLE: 1}),
    "far_east": ([(3150, -3440), (3200, -3620)], {SAKURA: 3, MAPLE: 1.4, SHRUB: 0.8, PINE: 2, GEN: 1.8, CYPRESS: 0.6}),
    "china": ([(2760, -3400), (2700, -3560)], {METASEQ: 2.2, SHRUB: 0.9, SAKURA: 1.5, CYPRESS: 1.5, GEN: 2.6, PINE: 1, WILLOW: 0.4}),
    "arboretum": ([(3060, -3790), (3250, -3880)], {CHINAR: 3, OAK: 2.5, SPRUCE: 1.5, GEN: 3}),
}
ALLEY = {"central_asia": CHINAR, "arboretum": CHINAR, "far_east": SAKURA, "china": SAKURA, "north_america": MAPLE, "europe": BIRCH}
# здания OSM, которые заменяют модели сада (центры, мировые м)
HIDE = [(3035, -3973), (3153, -4018), (2981, -3710), (2975, -3671), (2586, -3741)]


def code(sp, f, rng):
    if sp == GEN: return int(f * 84)
    if sp == POPLAR: return 170 + int(f * 84)
    return 85 + sp * 7 + min(6, int(f * 7))


def load(D, tx, ty):
    p = os.path.join(D, "t", f"{tx}_{ty}.js"); s = open(p, encoding="utf-8", newline="").read()
    mm = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
    return p, mm, zlib.decompress(base64.b64decode(mm[3]))


def blocks(B):
    """Разбор тайла на блоки [(tag, start, end)] и содержимое, нужное саду."""
    r = Dec(B); out = []; A, L, BL, TR = [], [], [], []
    while True:
        st = r.P; tag = r.u8()
        if tag == 0: out.append((0, st, len(B))); break
        if tag == 1:
            for _ in range(r.vr()): c = r.u8(); A.append((c, [r.ptsl() for _ in range(r.vr())]))
        elif tag == 2:
            for _ in range(r.vr()): c = r.u8(); fl = r.u8(); L.append((c, fl, r.ptsl()))
        elif tag == 3:
            for _ in range(r.vr()):
                h = r.vr() / 10; r.vr(); r.u8(); r.vr(); r.P += 7; BL.append((h, r.ptsl()))
        elif tag == 4:
            x = z = 0
            for _ in range(r.vr()): x += r.sv(); z += r.sv(); TR.append((x, z, r.u8()))
        else: r.skip(tag)
        out.append((tag, st, r.P))
    return out, A, L, BL, TR


def main(D, preview=None, dry=False):
    rng = np.random.default_rng(1950)
    X0, Z0, X1, Z1 = BOX; NX, NZ = X1 - X0, Z1 - Z0
    W = lambda x, z: ((x - X0), (z - Z0))
    garden = Image.new("L", (NX, NZ), 0); gd = ImageDraw.Draw(garden)
    path = Image.new("L", (NX, NZ), 0); pd = ImageDraw.Draw(path)
    bld = Image.new("L", (NX, NZ), 0); bd = ImageDraw.Draw(bld)
    wat = Image.new("L", (NX, NZ), 0); wd = ImageDraw.Draw(wat)
    T = {}; axis = []; ponds = []; gpolys = []
    for tx, ty in TILES:
        p, mm, B = load(D, tx, ty); bl, A, L, BL, TR = blocks(B)
        ox, oz = (tx * SIZE - gx(LNG0)) * MPU, (ty * SIZE - gy(LAT0)) * MPU
        T[(tx, ty)] = dict(p=p, mm=mm, B=B, bl=bl, A=A, TR=TR, ox=ox, oz=oz, BL=BL)
        for c, rings in A:
            r = [(x + ox, z + oz) for x, z in rings[0]]; xs = [q[0] for q in r]; zs = [q[1] for q in r]
            if c in (4, 17) and len(r) > 20 and min(xs) > X0 and max(xs) < X1 and min(zs) > Z0 and max(zs) < Z1:
                gd.polygon([W(*q) for q in r], fill=255); gpolys.append(r)
            if c == 8 and min(xs) > X0 and max(xs) < X1 and min(zs) > Z0 and max(zs) < Z1:
                wd.polygon([W(*q) for q in r], fill=255); ponds.append(r)
        for c, fl, o in L:
            w = [W(x + ox, z + oz) for x, z in o]
            if c in (13, 14, 15): wd.line(w, fill=255, width=4 if c == 15 else 8)
            elif not fl & 8: pd.line(w, fill=255, width=3 if c >= 6 else 8)
            if c == 6 and fl & 1: axis.append([(x + ox, z + oz) for x, z in o])
        for h, fp in BL:
            cx = sum(q[0] for q in fp) / len(fp) + ox; cz = sum(q[1] for q in fp) / len(fp) + oz
            if any(math.hypot(cx - a, cz - b) < 6 for a, b in HIDE): continue
            bd.polygon([W(x + ox, z + oz) for x, z in fp], fill=255)
    assert len(gpolys) == 2, len(gpolys)
    # модели сада: оранжереи, сцена с трибуной, вход
    lm = json.loads(re.search(r"TPM_LM\((.*)\);", open(os.path.join(D, "lm.js"), encoding="utf-8").read(), re.S)[1])
    for k in ("botanic_gh", "botanic_stage", "botanic_gate", "botanic_relic"):
        o = lm.get(k, {}); sub = o.get("sub", {})
        for pt in o.get("parts", []): bd.polygon([W(*q) for q in pt["p"]], fill=255)
        if k == "botanic_relic": bd.ellipse([W(o["x"] - 6, o["z"] - 6), W(o["x"] + 6, o["z"] + 6)], fill=255)
        if "gz" in sub: x, z = sub["gz"]; bd.ellipse([W(x - 5, z - 5), W(x + 5, z + 5)], fill=255)
        if "b0" in sub: bd.line([W(*sub["b0"]), W(*sub["b1"])], fill=255, width=4)
        if "gate" in sub:  # портал с оградой и цветники вдоль дорожки
            (x0, z0), (x1, z1) = sub["gate"], sub["gate2"]; L = math.hypot(x1 - x0, z1 - z0); ux, uz = (x1 - x0) / L, (z1 - z0) / L
            bd.line([W(x0 - ux * 4, z0 - uz * 4), W(x0 + ux * 44, z0 + uz * 44)], fill=255, width=22)
            bd.line([W(x0 + uz * 34, z0 - ux * 34), W(x0 - uz * 34, z0 + ux * 34)], fill=255, width=5)
    G = np.array(garden) > 0
    dP = ndimage.distance_transform_edt(np.array(path) == 0)
    dB = ndimage.distance_transform_edt(np.array(bld) == 0)
    dW = ndimage.distance_transform_edt(np.array(wat) == 0)
    # зона каждой клетки: ближайший центр экспозиции с «волнистой» границей
    zn = list(ZONES); seeds = [(i, x - X0, z - Z0) for i, k in enumerate(zn) for x, z in ZONES[k][0]]
    jj, ii = np.mgrid[0:NZ:4, 0:NX:4]
    wob = ndimage.zoom(rng.random((NZ // 60 + 2, NX // 60 + 2)), 15, order=1)[:jj.shape[0], :jj.shape[1]] * 90
    dist = np.stack([np.hypot(ii - sx, jj - sz) + wob * ((k % 3) - 1) for k, (i, sx, sz) in enumerate(seeds)])
    Zg = np.array([s[0] for s in seeds])[np.argmin(dist, axis=0)]
    zone_at = lambda x, z: zn[Zg[min(Zg.shape[0] - 1, int((z - Z0) / 4)), min(Zg.shape[1] - 1, int((x - X0) / 4))]]
    trees = []; occ = {}
    def free(x, z, sp, f, lane=False):
        i, j = int(x - X0), int(z - Z0)
        if not (0 <= i < NX and 0 <= j < NZ) or not G[j, i]: return False
        R = R_of(sp, f)
        if dB[j, i] < R + 1.0: return False
        if dW[j, i] < (1.0 if sp == WILLOW else R * 0.6 + 1.5): return False
        if dP[j, i] < (2.6 if lane else R * 0.55 + 1.8): return False
        s = SPACE[sp] * (0.85 + f * 0.3); ci, cj = int(x // 8), int(z // 8)
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for qx, qz, qs in occ.get((ci + a, cj + b), ()):
                    if (qx - x) ** 2 + (qz - z) ** 2 < ((s + qs) / 2) ** 2: return False
        return True
    def plant(x, z, sp, f):
        occ.setdefault((int(x // 8), int(z // 8)), []).append((x, z, SPACE[sp] * (0.85 + f * 0.3))); trees.append((x, z, code(sp, f, rng)))
    pick = lambda w: list(w)[rng.choice(len(w), p=np.array(list(w.values())) / sum(w.values()))]
    # 1) ивы по берегам прудов
    for r in ponds:
        cx = sum(q[0] for q in r) / len(r); cz = sum(q[1] for q in r) / len(r)
        per = sum(math.dist(r[i], r[i - 1]) for i in range(len(r))); acc = 0
        for i in range(len(r)):
            (ax, az), (bx, bz) = r[i - 1], r[i]; Ls = math.dist((ax, az), (bx, bz)); t = acc
            while t < Ls:
                x, z = ax + (bx - ax) * t / Ls, az + (bz - az) * t / Ls; d = math.hypot(x - cx, z - cz) or 1
                x, z = x + (x - cx) / d * 4.5, z + (z - cz) / d * 4.5; f = rng.random()
                if rng.random() < 0.75 and free(x, z, WILLOW, f): plant(x, z, WILLOW, f)
                t += 11
            acc = t - Ls
    # 2) аллеи вдоль главной оси (двойная пешеходная) и от главного входа
    entry = [(2590, -3739), (2636, -3731), (2644, -3727), (2739, -3691)]
    for line, step in [(q, 9.0) for q in axis] + [(entry, 8.0)]:
        acc = 0
        for i in range(len(line) - 1):
            (ax, az), (bx, bz) = line[i], line[i + 1]; Ls = math.dist((ax, az), (bx, bz)); t = acc
            if Ls < 1: continue
            ux, uz = (bx - ax) / Ls, (bz - az) / Ls
            while t < Ls:
                for side in (1, -1):
                    x, z = ax + ux * t - uz * 4.2 * side, az + uz * t + ux * 4.2 * side
                    sp = ALLEY[zone_at(x, z)]; f = 0.45 + rng.random() * 0.3
                    if free(x, z, sp, f, lane=True): plant(x, z, sp, f)
                t += step
            acc = t - Ls
    # 3) рощицы: одна порода с примесью, между ними — поляны
    cands = []
    for _ in range(14000):
        x, z = X0 + rng.random() * NX, Z0 + rng.random() * NZ
        if G[int(z - Z0), int(x - X0)] and all((x - a) ** 2 + (z - b) ** 2 > 24 ** 2 for a, b in cands[-600:]): cands.append((x, z))
    for cx, cz in cands:
        if rng.random() < 0.2: continue  # поляна
        zone = zone_at(cx, cz); main_sp = pick(ZONES[zone][1]); rad = 10 + rng.random() * 14
        n = int(rad * rad * math.pi / (SPACE[main_sp] ** 2) * 2.4)
        for _ in range(n):
            a, d = rng.random() * 6.283, rad * math.sqrt(rng.random())
            x, z = cx + math.cos(a) * d, cz + math.sin(a) * d
            sp = main_sp if rng.random() < 0.8 else pick(ZONES[zone][1]); f = rng.random()
            if free(x, z, sp, f): plant(x, z, sp, f)
    # 4) солитёры на полянах
    for _ in range(int(G.sum() / 650)):
        x, z = X0 + rng.random() * NX, Z0 + rng.random() * NZ
        if not (0 <= int(z - Z0) < NZ and G[int(z - Z0), int(x - X0)]): continue
        zone = zone_at(x, z); sp = pick({CHINAR: 2, OAK: 2, SPRUCE: 1, MAPLE: 1.5, SAKURA: 1, METASEQ: 1} if zone in ("arboretum", "central_asia") else ZONES[zone][1]); f = 0.5 + rng.random() * 0.5
        if free(x, z, sp, f): plant(x, z, sp, f)
    print("garden trees:", len(trees), "zones:", {k: sum(1 for x, z, c in trees if zone_at(x, z) == k) for k in zn})
    if preview:
        im = Image.new("RGB", (NX, NZ), (150, 145, 120)); dr = ImageDraw.Draw(im)
        im.paste((112, 146, 76), mask=garden); im.paste((200, 188, 152), mask=path); im.paste((62, 108, 140), mask=wat); im.paste((230, 230, 230), mask=bld)
        pal = [(30, 70, 40), (25, 65, 55), (190, 100, 40), (20, 55, 30), (170, 200, 80), (240, 160, 200), (200, 70, 150), (220, 170, 60), (250, 220, 70), (210, 50, 30), (150, 110, 40)]
        for x, z, c in trees:
            col = pal[(c - 85) // 7] if 85 <= c < 170 else ((120, 160, 60) if c < 85 else (90, 140, 60))
            R = R_of((c - 85) // 7, ((c - 85) % 7) / 6) if 85 <= c < 170 else 2.5
            dr.ellipse([x - X0 - R, z - Z0 - R, x - X0 + R, z - Z0 + R], fill=col)
        im.save(preview)
    if dry: return
    # ---- запись: деревья сада, класс земли, скрытые здания ----
    inside = lambda x, z: G[int(z - Z0), int(x - X0)] if X0 <= x < X1 and Z0 <= z < Z1 else False
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read()
    for (tx, ty), t in T.items():
        B, ox, oz = t["B"], t["ox"], t["oz"]; TM = SIZE * MPU
        keep = [(x, z, r) for x, z, r in t["TR"] if not inside(x / 10 + ox, z / 10 + oz)]
        mine = [(int((x - ox) * 10), int((z - oz) * 10), c) for x, z, c in trees if 0 <= x - ox < TM and 0 <= z - oz < TM]
        allt = keep + mine; out = b""
        for tag, st, en in t["bl"]:
            seg = B[st:en]
            if tag == 4:
                seg = bytes([4]) + wvar(len(allt)); px0 = pz0 = 0
                for x, z, r in allt: seg += wsv(x - px0) + wsv(z - pz0) + bytes([r & 255]); px0, pz0 = x, z
            elif tag == 1:  # лес сада -> газон с рощами
                r = Dec(B); r.P = st + 1; n = r.vr(); seg = bytearray([1]) + wvar(n)
                for _ in range(n):
                    a = r.P; c = r.u8(); rings = [r.ptsl() for _ in range(r.vr())]; body = bytearray(B[a:r.P])
                    rr = [(x + ox, z + oz) for x, z in rings[0]]
                    if c in (4, 17) and any(rr == g for g in gpolys): body[0] = 17
                    seg += body
                seg = bytes(seg)
            elif tag == 3:  # здания под моделями сада
                r = Dec(B); r.P = st + 1; n = r.vr(); kept = []
                for _ in range(n):
                    a = r.P; r.vr(); r.vr(); r.u8(); r.vr(); r.P += 7; fp = r.ptsl()
                    cx = sum(q[0] for q in fp) / len(fp) + ox; cz = sum(q[1] for q in fp) / len(fp) + oz
                    if not any(math.hypot(cx - a_, cz - b_) < 6 for a_, b_ in HIDE): kept.append(B[a:r.P])
                seg = bytes([3]) + wvar(len(kept)) + b"".join(kept)
            out += seg
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(t["p"], "w", encoding="utf-8", newline="").write(f'TPM_TILE({tx},{ty},"{b64}");{t["mm"][4]}')
        ix, k = re.subn(rf"\[{tx},{ty},\d+,\d+\]", lambda m_: f"[{tx},{ty},{len(b64)},{m_[0].split(',')[3]}", ix); assert k == 1
        print(tx, ty, "trees", len(t["TR"]), "->", len(allt))
    open(ixp, "w", encoding="utf-8", newline="").write(ix)


if __name__ == "__main__":
    a = sys.argv[1:]
    main(a[0], a[a.index("--preview") + 1] if "--preview" in a else None, "--dry" in a)
