# =====================================================================
#  Точечные исправления готовых тайлов по спутнику и панорамам — там,
#  где разметка OSM расходится с реальностью: класс участка (газон, который
#  на деле пустырь), высота и цвета отдельного здания, лишние деревья,
#  здания OSM под моделями (hide) и площадки без деревьев (clear: x, z, радиус).
#  Объект ищется по центру контура (мировые м, ±tol). Повторный запуск безопасен.
#      python tools/bake/patches.py data
# =====================================================================
import base64, math, os, re, sys, zlib
sys.path.insert(0, os.path.dirname(__file__))
from pitches import wvar, wsv, gx, gy, LAT0, LNG0, MPU, SIZE
from botanic import load
from greenery import Dec

PATCHES = [
    # Богишамол, бывший лакокрасочный завод: «газон» к югу от логистического склада — на деле
    # пустырь с голой землёй (спутник Яндекса, 2025); деревьев там почти нет
    {"tile": (11346, 6122), "area": (2377, -2811), "cls": 18, "keep_trees": 0.05},
    # сам склад: тёмно-серая кровля из сэндвич-панелей, светло-серые стены, ~11 м
    {"tile": (11346, 6122), "bld": (2427, -3037), "h": 11.5, "wall": 0xC2C6CA, "roof": 0x595D64},
    # мемориал «Шахидлар хотираси»: музей с двумя куполами и ротонда — модель shahidlar (models-decor.js);
    # здания OSM под ней прячем, вокруг ротонды — открытый партер с клумбами, у музея — мощёная площадка
    {"tile": (11345, 6121), "hide": [(710, -3995), (713, -4009), (709, -3981), (703, -4089)]},
    {"tile": (11345, 6121), "clear": (703, -4089, 24)},
    {"tile": (11345, 6121), "clear": (710, -3995, 31)},
    # Центр исламской цивилизации у Хазрати Имама — модель islamic_center (корпус, порталы, купол)
    {"tile": (11343, 6122), "hide": [(-3283, -2684), (-3283, -2685), (-3293, -2686), (-3215, -2710), (-3365, -2665), (-3360, -2669), (-3304, -2742), (-3272, -2632)]},
    {"tile": (11343, 6122), "clear": (-3289, -2687, 88)},
]


def inside(poly, x, z):
    c = False
    for i in range(len(poly)):
        (x1, z1), (x2, z2) = poly[i], poly[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c


def main(D):
    by = {}
    for p in PATCHES: by.setdefault(p["tile"], []).append(p)
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read()
    for (tx, ty), PS in by.items():
        path, mm, B = load(D, tx, ty); ox, oz = (tx * SIZE - gx(LNG0)) * MPU, (ty * SIZE - gy(LAT0)) * MPU
        r = Dec(B); out = b""; clear = []
        hide = [q for p in PS for q in p.get("hide", [])]
        circles = [p["clear"] for p in PS if "clear" in p]
        while True:
            st = r.P; tag = r.u8()
            if tag == 0: out += B[st:]; break
            if tag == 1:
                n = r.vr(); seg = bytearray([1]) + wvar(n)
                for _ in range(n):
                    a = r.P; c = r.u8(); rings = [r.ptsl() for _ in range(r.vr())]; body = bytearray(B[a:r.P])
                    w = [(x + ox, z + oz) for x, z in rings[0]]; cx = sum(q[0] for q in w) / len(w); cz = sum(q[1] for q in w) / len(w)
                    for p in PS:
                        if "area" in p and math.hypot(cx - p["area"][0], cz - p["area"][1]) < 8:
                            body[0] = p["cls"]; clear.append((w, p.get("keep_trees", 1))); print("area", p["area"], c, "->", p["cls"])
                    seg += body
                out += bytes(seg)
            elif tag == 3:
                n = r.vr(); seg = bytearray(); kept = 0
                for _ in range(n):
                    h = r.vr(); mh = r.vr(); roof = r.u8(); rh = r.vr(); wall = B[r.P:r.P + 3]; rc = B[r.P + 3:r.P + 6]; kind = B[r.P + 6]; r.P += 7
                    a = r.P; fp = r.ptsl(); pts = B[a:r.P]
                    cx = sum(q[0] for q in fp) / len(fp) + ox; cz = sum(q[1] for q in fp) / len(fp) + oz
                    if any(math.hypot(cx - a_, cz - b_) < 4 for a_, b_ in hide): print("hide", int(cx), int(cz)); continue
                    for p in PS:
                        if "bld" in p and math.hypot(cx - p["bld"][0], cz - p["bld"][1]) < 8:
                            h = int(p.get("h", h / 10) * 10); wall = p.get("wall", int.from_bytes(wall, "big")).to_bytes(3, "big"); rc = p.get("roof", int.from_bytes(rc, "big")).to_bytes(3, "big")
                            print("bld", p["bld"], "h", h / 10)
                    seg += wvar(h) + wvar(mh) + bytes([roof]) + wvar(rh) + bytes(wall) + bytes(rc) + bytes([kind]) + pts; kept += 1
                out += bytes([3]) + wvar(kept) + bytes(seg)
            elif tag == 4:
                n = r.vr(); x = z = 0; T = []
                for _ in range(n): x += r.sv(); z += r.sv(); T.append((x, z, r.u8()))
                keep = []
                for x, z, c in T:
                    wx, wz = x / 10 + ox, z / 10 + oz
                    if any(inside(w, wx, wz) and (hash((x, z)) % 1000) / 1000 >= k for w, k in clear): continue
                    if any(math.hypot(wx - a_, wz - b_) < rr for a_, b_, rr in circles): continue
                    keep.append((x, z, c))
                if len(keep) != len(T): print("trees", len(T), "->", len(keep))
                seg = bytes([4]) + wvar(len(keep)); px0 = pz0 = 0
                for x, z, c in keep: seg += wsv(x - px0) + wsv(z - pz0) + bytes([c]); px0, pz0 = x, z
                out += seg
            else:
                r.skip(tag); out += B[st:r.P]
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(path, "w", encoding="utf-8", newline="").write(f'TPM_TILE({tx},{ty},"{b64}");{mm[4]}')
        ix, k = re.subn(rf"\[{tx},{ty},\d+,", f"[{tx},{ty},{len(b64)},", ix); assert k == 1
    open(ixp, "w", encoding="utf-8", newline="").write(ix)


if __name__ == "__main__":
    main(sys.argv[1])
