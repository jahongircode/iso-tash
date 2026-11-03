# =====================================================================
#  Озеленение: Ташкент гораздо зеленее, чем выходит из OSM. Скрипт
#  проходит по готовым тайлам и
#   1) убирает деревья, чьи кроны залезают на здания и модели
#      достопримечательностей;
#   2) досаживает деревья во дворы микрорайонов, у школ и больниц,
#      на газоны и пустыри — рощицами, а не равномерной сыпью, с отступом
#      от стен, дорог, воды и спортплощадок.
#  Запускать один раз после bake.py (и pitches.py):
#      python tools/bake/greenery.py data
#  Затем густые дворы микрорайонов:  python tools/bake/greenery.py data --yards
#  Повторный запуск досадит ещё (поэтому есть флаг --prune-only).
# =====================================================================
import base64, json, math, os, re, sys, zlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pitches import Reader, wvar, wsv, gx, gy, LAT0, LNG0, MPU, SIZE

TILE_M = SIZE * MPU
ROAD_W = {0: 24, 1: 22, 2: 18, 3: 14, 4: 11, 5: 7.5, 6: 4.5, 7: 3, 8: 2.5, 9: 4, 10: 3, 11: 45, 12: 20, 13: 22, 14: 9, 15: 3}
# вероятность нового дерева на 16 м² свободной земли по классу участка (-1 — участок без класса)
ADD = {-1: 0.07, 0: 0.13, 10: 0.15, 1: 0.04, 2: 0.025, 3: 0.08, 14: 0.06, 17: 0.05, 5: 0.0, 7: 0.04, 16: 0.03}
NO = {8, 9, 6, 11}  # вода, стадионы/поля, песок, болото
G = 1.0  # шаг растра, м
SPACING = 4.6  # не ближе к соседнему дереву


def crown(r):
    """Радиус кроны, как в tiles.js makeTrees."""
    f = r % 1
    if r >= 2: return 1.5 + f * 0.8
    if ((r * 7919) % 1) < 0.1: return (6 + f * 7.5) / 3.4 * 0.75  # хвойное
    return (6 + f * 7.5) * (0.3 + ((f * 7) % 1) * 0.1)


class Dec(Reader):
    def sv(self): v = self.vr(); return (v >> 1) ^ -(v & 1)
    def ptsl(self):
        n = self.vr(); x = z = 0; o = []
        for _ in range(n): x += self.sv(); z += self.sv(); o.append((x / 10, z / 10))
        return o


def parse(B):
    r = Dec(B); A, L, BL, TR, CT, HB = [], [], [], [], [], []; s4 = e4 = None
    while True:
        st = r.P; tag = r.u8()
        if tag == 0: return A, L, BL, HB, TR, CT, s4, e4, st
        if tag == 1:
            for _ in range(r.vr()): c = r.u8(); A.append((c, [r.ptsl() for _ in range(r.vr())]))
        elif tag == 2:
            for _ in range(r.vr()): c = r.u8(); fl = r.u8(); L.append((c, fl, r.ptsl()))
        elif tag == 3:
            for _ in range(r.vr()): h = r.vr() / 10; r.vr(); r.u8(); r.vr(); r.P += 7; BL.append(r.ptsl()); HB.append(h)
        elif tag == 4:
            s4 = st; x = z = 0
            for _ in range(r.vr()): x += r.sv(); z += r.sv(); TR.append((x, z, r.u8()))
            e4 = r.P
        elif tag == 8:
            for _ in range(r.vr()): r.u8(); r.u8(); CT.append(r.ptsl())
        else: r.skip(tag)


def main(D, prune_only=False, yards=False):
    lm = json.loads(re.search(r"TPM_LM\((.*)\);", open(os.path.join(D, "lm.js"), encoding="utf-8").read(), re.S)[1])
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read()
    N = int(TILE_M / G) + 1
    tot0 = tot1 = rm = add = 0
    files = sorted(f for f in os.listdir(os.path.join(D, "t")) if re.match(r"\d+_\d+\.js$", f))
    for fi, fn in enumerate(files):
        tx, ty = map(int, fn[:-3].split("_")); p = os.path.join(D, "t", fn)
        s = open(p, encoding="utf-8", newline="").read(); mm = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
        B = zlib.decompress(base64.b64decode(mm[3]))
        A, L, BL, HB, TR, CT, s4, e4, end = parse(B)
        if not TR and not A: continue
        ox, oz = (tx * SIZE - gx(LNG0)) * MPU, (ty * SIZE - gy(LAT0)) * MPU  # угол тайла в мировых м
        P = lambda q: [(x / G, z / G) for x, z in q]
        cls = Image.new("I", (N, N), -1); cd = ImageDraw.Draw(cls)
        for c, rings in A:
            for k, rg in enumerate(rings):
                if len(rg) > 2: cd.polygon(P(rg), fill=c if k == 0 else -1)
        bld = Image.new("L", (N, N), 0); bd = ImageDraw.Draw(bld)
        mid = Image.new("L", (N, N), 0); md = ImageDraw.Draw(mid)
        for fp, h in zip(BL, HB):
            if len(fp) > 2:
                bd.polygon(P(fp), fill=255)
                if h >= 9: md.polygon(P(fp), fill=255)
        # модели достопримечательностей: прямоугольник L×W, повёрнутый на ang
        for o in lm.values():
            if not o.get("L"): continue
            cx, cz = (o["x"] - ox) / G, (o["z"] - oz) / G
            if not (-400 < cx < N + 400 and -400 < cz < N + 400): continue
            c_, s_ = math.cos(o["ang"]), math.sin(o["ang"]); hl, hw = o["L"] / 2 / G, o["W"] / 2 / G
            bd.polygon([(cx + a * hl * c_ - b * hw * s_, cz + a * hl * s_ + b * hw * c_) for a, b in ((1, 1), (-1, 1), (-1, -1), (1, -1))], fill=255)
        road = Image.new("L", (N, N), 0); rd = ImageDraw.Draw(road)
        for c, fl, o in L:
            if fl & 8 or len(o) < 2: continue
            rd.line(P(o), fill=255, width=max(1, int((ROAD_W.get(c, 6) + (3 if c not in (8, 15) else 0)) / G)))
        for fp in CT:
            if len(fp) > 2: rd.polygon(P(fp), fill=255)
        Bm = np.array(bld) > 0
        dB = ndimage.distance_transform_edt(~Bm) * G
        Rm = np.array(road) > 0
        dR = ndimage.distance_transform_edt(~Rm) * G
        C = np.array(cls)
        # 1) убрать деревья, у которых крона на здании
        keep = []
        for x, z, r in TR:
            gx_, gz_ = int(x / 10 / G), int(z / 10 / G)
            if 0 <= gx_ < N and 0 <= gz_ < N and dB[gz_, gx_] < crown(r / 85) * 0.85 + 0.3: rm += 1; continue
            keep.append((x, z, r))
        tot0 += len(TR)
        new = []
        if not prune_only:
            # 2) досадка: рощицы по шуму, отступы от стен/дорог, интервал между деревьями
            rng = np.random.default_rng(tx * 100003 + ty + 7)
            pr = np.full(C.shape, ADD[-1], np.float32)
            for c, v in ADD.items():
                if c >= 0: pr[C == c] = v
            for c in NO: pr[C == c] = 0
            pr[C == 4] = 0  # леса и так густые
            nz = ndimage.zoom(rng.random((N // 45 + 2, N // 45 + 2)), 45, order=1)[:N, :N]
            nz2 = ndimage.zoom(rng.random((N // 14 + 2, N // 14 + 2)), 14, order=1)[:N, :N]
            if yards:  # дворы микрорайонов: до 45 м от домов в 3+ этажа
                dM = ndimage.distance_transform_edt(np.array(mid) == 0) * G
                yd = np.isin(C, (-1, 0, 10, 3, 14)) & (dM < 45)
                pr = np.where(yd, 0.32, 0).astype(np.float32)
            pr *= np.clip((nz * 0.75 + nz2 * 0.5) * 1.9 - 0.55, 0, 1.6)
            pr[(dB < 3.2) | (dR < 1.5)] = 0
            # обычный шаг 4 м -> вероятность на 1 клетку
            pr = pr * (G * G) / 16
            ys, xs = np.nonzero(rng.random(C.shape) < pr)
            occ = {}
            def near(x, z):
                i, j = int(x // SPACING), int(z // SPACING)
                for a in (-1, 0, 1):
                    for b in (-1, 0, 1):
                        for qx, qz in occ.get((i + a, j + b), ()):
                            if (qx - x) ** 2 + (qz - z) ** 2 < SPACING * SPACING: return True
                return False
            for x, z, r in keep: occ.setdefault((int(x / 10 // SPACING), int(z / 10 // SPACING)), []).append((x / 10, z / 10))
            order = rng.permutation(len(xs))
            for k in order:
                x, z = (xs[k] + rng.random()) * G, (ys[k] + rng.random()) * G
                rb = int(rng.random() * 85)  # 0..1: лиственное, размер по f
                if rng.random() < 0.06: rb = 170 + int(rng.random() * 84)  # тополь
                R = crown(rb / 85)
                if dB[ys[k], xs[k]] < R * 0.8 + 0.6 or dR[ys[k], xs[k]] < R * 0.45 + 1.0 or near(x, z): continue
                occ.setdefault((int(x // SPACING), int(z // SPACING)), []).append((x, z))
                new.append((int(x * 10), int(z * 10), rb))
        allt = keep + new; add += len(new); tot1 += len(allt)
        if len(allt) == len(TR) and not new: continue
        blk = bytes([4]) + wvar(len(allt)); px0 = pz0 = 0
        for x, z, r in allt: blk += wsv(x - px0) + wsv(z - pz0) + bytes([r & 255]); px0, pz0 = x, z
        out = (B[:s4] + blk + B[e4:]) if s4 is not None else (B[:end] + blk + B[end:])
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(p, "w", encoding="utf-8", newline="").write(f'TPM_TILE({tx},{ty},"{b64}");{mm[4]}')
        ix, k = re.subn(rf"\[{tx},{ty},\d+,", f"[{tx},{ty},{len(b64)},", ix); assert k == 1
        if fi % 50 == 0: print(f"{fi}/{len(files)}  trees {tot0} -> {tot1} (-{rm} +{add})", flush=True)
    open(ixp, "w", encoding="utf-8", newline="").write(ix)
    print(f"DONE trees {tot0} -> {tot1}: removed {rm} (on buildings), added {add}")


if __name__ == "__main__":
    main(sys.argv[1], "--prune-only" in sys.argv, "--yards" in sys.argv)
