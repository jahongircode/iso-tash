# =====================================================================
#  Пешеходные переходы — только там, где они есть в OSM: узлы
#  highway=crossing (зебра, регулируемый светофором, нерегулируемый
#  размеченный). Неразмеченные (crossing=unmarked, crossing:markings=no)
#  пропускаются. Пишутся в тайлы блоком 9: точка (дм, дельтами) и тип
#  (0 — зебра, 1 — переход со светофором). Направление зебры воркер берёт
#  от ближайшей дороги.
#  Загрузка:  python tools/bake/crossings.py fetch osm/crossings.json
#  Запись:    python tools/bake/crossings.py bake osm/crossings.json data
# =====================================================================
import base64, json, os, re, sys, urllib.parse, urllib.request, zlib
sys.path.insert(0, os.path.dirname(__file__))
from pitches import Reader, wvar, wsv, gx, gy, MPU, SIZE, BBOX, EP


def fetch(out):
    q = f'[out:json][timeout:150];node["highway"="crossing"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});out;'
    for ep in EP:
        try:
            r = urllib.request.urlopen(urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "TashkentPixelMap/1.0"}), timeout=160)
            d = json.load(r); json.dump(d, open(out, "w", encoding="utf-8")); print(len(d["elements"]), "crossings"); return
        except Exception as e: print(ep, e)
    sys.exit("overpass failed")


def bake(src, D):
    by = {}; skipped = 0
    for e in json.load(open(src, encoding="utf-8"))["elements"]:
        t = e.get("tags", {}); c = t.get("crossing", ""); mk = t.get("crossing:markings", "")
        if c == "unmarked" or mk == "no": skipped += 1; continue
        typ = 1 if "traffic_signals" in c or t.get("crossing:signals") == "yes" else 0
        tk = (int(gx(e["lon"]) / SIZE), int(gy(e["lat"]) / SIZE))
        ox, oz = tk[0] * SIZE, tk[1] * SIZE
        by.setdefault(tk, []).append((round((gx(e["lon"]) - ox) * MPU * 10), round((gy(e["lat"]) - oz) * MPU * 10), typ))
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read(); total = 0
    for fn in os.listdir(os.path.join(D, "t")):
        m = re.match(r"(\d+)_(\d+)\.js$", fn)
        if not m: continue
        tk = (int(m[1]), int(m[2])); p = os.path.join(D, "t", fn)
        s = open(p, encoding="utf-8", newline="").read(); mm = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
        B = zlib.decompress(base64.b64decode(mm[3])); r = Reader(B); s9 = e9 = None
        while True:
            st = r.P; tag = r.u8()
            if tag == 0: end = st; break
            r.skip(tag)
            if tag == 9: s9, e9 = st, r.P
        body = B[:s9] + B[e9:end] if s9 is not None else B[:end]
        L = sorted(by.get(tk, [])); blk = b""
        if L:
            blk = bytes([9]) + wvar(len(L)); x = z = 0
            for px, pz, typ in L: blk += wsv(px - x) + wsv(pz - z) + bytes([typ]); x, z = px, pz
        out = body + blk + B[end:]
        if out == B: continue
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(p, "w", encoding="utf-8", newline="").write(f'TPM_TILE({tk[0]},{tk[1]},"{b64}");{mm[4]}')
        ix, k = re.subn(rf"\[{tk[0]},{tk[1]},\d+,", f"[{tk[0]},{tk[1]},{len(b64)},", ix); assert k == 1
        total += len(L)
    open(ixp, "w", encoding="utf-8", newline="").write(ix)
    print("crossings:", total, "skipped unmarked:", skipped)


if __name__ == "__main__":
    if sys.argv[1] == "fetch": fetch(sys.argv[2])
    else: bake(sys.argv[2], sys.argv[3])
