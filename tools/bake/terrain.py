# =====================================================================
#  Рельеф: карта высот города для отмывки склонов и 3D-земли.
#  Источник — Terrain Tiles (Terrarium PNG, AWS Open Data, Mapzen/Tilezen),
#  в Ташкенте это SRTM ~30 м. Тайлы z13 склеиваются, высота считается в узлах
#  сетки с шагом STEP м по всему городу (система координат карты: метры от сквера
#  Амира Темура). SRTM — модель поверхности: кварталы высоток и рощи дают ложные
#  бугры, поэтому сначала «открытие» (минимум, потом максимум по окну ~200 м),
#  затем сглаживание. Рельеф раскладывается на тренд (сглаженный по ~2 км — общий
#  уклон города) и детали (долины каналов, холмы); детали в браузере усиливаются.
#  Запись: data/terrain.js — TPM_TERRAIN({...}).
#      python tools/bake/terrain.py data
# =====================================================================
import base64, io, json, math, os, re, sys, urllib.request, zlib
import numpy as np
from PIL import Image
from scipy import ndimage

sys.path.insert(0, os.path.dirname(__file__))
from pitches import gx, gy, LAT0, LNG0, MPU, SIZE, wvar, wsv

Z = 13
STEP = 50.0          # шаг сетки высот, м
TREND_STEP = 1000.0  # шаг сетки тренда, м
URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
CACHE = os.path.join(os.path.dirname(__file__), "cache_terrain")


def tile_png(x, y):
    os.makedirs(CACHE, exist_ok=True)
    p = os.path.join(CACHE, f"{Z}_{x}_{y}.png")
    if not os.path.exists(p):
        req = urllib.request.Request(URL.format(z=Z, x=x, y=y), headers={"User-Agent": "TashkentPixelMap/1.0"})
        open(p, "wb").write(urllib.request.urlopen(req, timeout=60).read())
    a = np.asarray(Image.open(p).convert("RGB"), dtype=np.float64)
    return a[..., 0] * 256 + a[..., 1] + a[..., 2] / 256 - 32768


def main(D):
    ix = open(os.path.join(D, "index.js"), encoding="utf-8").read()
    T = [(int(a), int(b)) for a, b in re.findall(r"\[(\d+),(\d+),\d+,\d+\]", ix)]
    tx0, tx1 = min(t[0] for t in T), max(t[0] for t in T) + 1
    ty0, ty1 = min(t[1] for t in T), max(t[1] for t in T) + 1
    # мировые координаты рамки города (угол первого тайла z14)
    X0, Z0 = (tx0 * SIZE - gx(LNG0)) * MPU, (ty0 * SIZE - gy(LAT0)) * MPU
    X1, Z1 = (tx1 * SIZE - gx(LNG0)) * MPU, (ty1 * SIZE - gy(LAT0)) * MPU
    # мозаика z13 (тайл z13 = 2×2 тайла z14)
    mx0, mx1, my0, my1 = tx0 // 2, (tx1 - 1) // 2 + 1, ty0 // 2, (ty1 - 1) // 2 + 1
    M = np.zeros(((my1 - my0) * 256, (mx1 - mx0) * 256))
    n = 0
    for y in range(my0, my1):
        for x in range(mx0, mx1):
            M[(y - my0) * 256:(y - my0 + 1) * 256, (x - mx0) * 256:(x - mx0 + 1) * 256] = tile_png(x, y); n += 1
    print("terrarium tiles:", n, "range", M.min().round(1), M.max().round(1))
    # узлы сетки -> пиксели мозаики
    W, H = int(math.ceil((X1 - X0) / STEP)) + 1, int(math.ceil((Z1 - Z0) / STEP)) + 1
    xs = X0 + np.arange(W) * STEP; zs = Z0 + np.arange(H) * STEP
    PX = (gx(LNG0) + xs / MPU) * 2 ** Z - mx0 * 256
    PY = (gy(LAT0) + zs / MPU) * 2 ** Z - my0 * 256
    gy_, gx_ = np.meshgrid(PY, PX, indexing="ij")
    E = ndimage.map_coordinates(M, [gy_ - 0.5, gx_ - 0.5], order=1, mode="nearest")
    # убрать здания и кроны (открытие ~200 м), сгладить
    E = ndimage.grey_opening(E, size=(5, 5))
    E = ndimage.gaussian_filter(E, 1.3)
    # тренд — общий уклон города
    trend = ndimage.gaussian_filter(E, 2000 / STEP / 2.5, mode="nearest")
    ks = int(TREND_STEP / STEP)
    TW, TH = (W - 1) // ks + 2, (H - 1) // ks + 2
    tr = np.zeros((TH, TW))
    for j in range(TH):
        for i in range(TW): tr[j, i] = trend[min(H - 1, j * ks), min(W - 1, i * ks)]
    # детали = высота минус тренд, восстановленный так же, как в браузере (билинейно)
    tj = (np.arange(H) / ks)[:, None]; ti = (np.arange(W) / ks)[None, :]
    trb = ndimage.map_coordinates(tr, [np.broadcast_to(tj, (H, W)), np.broadcast_to(ti, (H, W))], order=1, mode="nearest")
    det = np.round((E - trb) * 10).astype(np.int64)  # дециметры
    # высота в начале координат (сквер Амира Темура) — уровень «0» сцены
    i0, j0 = (0 - X0) / STEP, (0 - Z0) / STEP
    ref = float(ndimage.map_coordinates(E, [[j0], [i0]], order=1)[0])
    out = bytearray()
    for j in range(H):
        prev = 0
        for i in range(W): v = int(det[j, i]); out += wsv(v - prev); prev = v
    b64 = base64.b64encode(zlib.compress(bytes(out), 9)).decode()
    meta = {"x0": round(X0, 2), "z0": round(Z0, 2), "step": STEP, "w": W, "h": H,
            "tstep": TREND_STEP, "tw": TW, "th": TH, "trend": [round(float(v), 1) for v in tr.ravel()],
            "ref": round(ref, 1), "src": "Terrain Tiles (Terrarium, AWS Open Data) — SRTM"}
    open(os.path.join(D, "terrain.js"), "w", encoding="utf-8").write(
        "// Рельеф города (tools/bake/terrain.py): детали высот в дм (дельты по строкам, deflate, base64) + тренд в м\n"
        "TPM_TERRAIN(" + json.dumps(meta, separators=(",", ":")) + ',"' + b64 + '");\n')
    print(f"grid {W}x{H} step {STEP} m, height {E.min():.1f}..{E.max():.1f} m, ref {ref:.1f}, detail {det.min()/10:.1f}..{det.max()/10:.1f} m, {len(b64)/1024:.0f} KB")


if __name__ == "__main__":
    main(sys.argv[1])
