# =====================================================================
#  Спортплощадки: футбольные поля между домами, теннисные, баскетбольные,
#  волейбольные корты. Берутся из OSM (leisure=pitch, sport, surface) и
#  дополнений tools/bake/pitches_extra.json (корты, найденные по спутнику,
#  которых нет в OSM). Пишутся в тайлы блоком 8 (вид спорта, покрытие, контур).
#  Загрузка:  python tools/bake/pitches.py fetch osm/pitches.json
#  Запись:    python tools/bake/pitches.py bake osm/pitches.json data
# =====================================================================
import base64, json, math, os, re, sys, urllib.parse, urllib.request, zlib

LAT0, LNG0, Z = 41.3111, 69.2797, 14
MPU = 40075016.686 * math.cos(math.radians(LAT0)) / 256
SIZE = 256 / 2 ** Z
def gx(l): return (l + 180) / 360 * 256
def gy(la): s = math.sin(math.radians(la)); return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 256
BBOX = (41.15, 69.05, 41.45, 69.60)
EP = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter"]

SPORT = {"soccer": 0, "football": 0, "futsal": 0, "tennis": 1, "padel": 1, "basketball": 2, "volleyball": 3, "beachvolleyball": 3, "multi": 4}
SURF = {"grass": 0, "artificial_turf": 1, "artificial_grass": 1, "clay": 2, "hard": 3, "acrylic": 3, "asphalt": 3, "concrete": 3, "tartan": 3, "rubber": 3, "paved": 3,
        "sand": 4, "dirt": 4, "ground": 4, "earth": 4, "gravel": 4}


def fetch(out):
    q = f'[out:json][timeout:180];(way["leisure"="pitch"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]});relation["leisure"="pitch"]({BBOX[0]},{BBOX[1]},{BBOX[2]},{BBOX[3]}););out geom tags;'
    for ep in EP:
        try:
            r = urllib.request.urlopen(urllib.request.Request(ep, data=urllib.parse.urlencode({"data": q}).encode(), headers={"User-Agent": "TashkentPixelMap/1.0"}), timeout=200)
            d = json.load(r); json.dump(d, open(out, "w", encoding="utf-8")); print(len(d["elements"]), "pitches"); return
        except Exception as e: print(ep, e)
    sys.exit("overpass failed")


class Reader:
    def __init__(self, B): self.B, self.P = B, 0
    def u8(self): v = self.B[self.P]; self.P += 1; return v
    def vr(self):
        r = s = 0
        while True:
            c = self.u8(); r += (c & 127) << s; s += 7
            if c < 128: return r
    def pts(self):
        for _ in range(2 * self.vr()): self.vr()
    def skip(self, tag):
        if tag == 1:
            for _ in range(self.vr()): self.u8(); [self.pts() for _ in range(self.vr())]
        elif tag == 2:
            for _ in range(self.vr()): self.u8(); self.u8(); self.pts()
        elif tag == 3:
            for _ in range(self.vr()): self.vr(); self.vr(); self.u8(); self.vr(); self.P += 7; self.pts()
        elif tag == 4:
            for _ in range(self.vr()): self.vr(); self.vr(); self.u8()
        elif tag == 5: self.pts()
        elif tag == 6:
            for _ in range(self.vr()):
                self.u8(); self.vr(); self.vr()
                for _ in range(2): n = self.vr(); self.P += n
        elif tag == 7:
            for _ in range(self.vr()): self.vr(); [self.vr() for _ in range(self.vr())]
        elif tag == 8:
            for _ in range(self.vr()): self.u8(); self.u8(); self.pts()
        else: raise ValueError("tag %d" % tag)


def wvar(n):
    o = bytearray()
    while n >= 128: o.append(n & 127 | 128); n >>= 7
    o.append(n); return bytes(o)
def wsv(v): return wvar(v * 2 if v >= 0 else -v * 2 - 1)


def rings(el):
    if "geometry" in el: return [[(p["lat"], p["lon"]) for p in el["geometry"]]]
    out = []
    for m in el.get("members", []):
        if m.get("role") in ("outer", "") and "geometry" in m: out.append([(p["lat"], p["lon"]) for p in m["geometry"]])
    return out


def bake(src, D):
    els = json.load(open(src, encoding="utf-8"))["elements"]
    extra = os.path.join(os.path.dirname(__file__), "pitches_extra.json")
    if os.path.exists(extra):  # уточнения по спутнику: покрытие/вид спорта существующих площадок и новые площадки
        ex = json.load(open(extra, encoding="utf-8"))
        ov = {int(k): v for k, v in ex.get("override", {}).items() if not k.startswith("_")}
        for el in els:
            if el.get("id") in ov: el.setdefault("tags", {}).update(ov[el["id"]])
        els += ex.get("add", [])
    # площадки внутри моделей достопримечательностей (стадионы и т.п.) — у моделей своё поле
    lm = json.loads(re.search(r"TPM_LM\((.*)\);", open(os.path.join(D, "lm.js"), encoding="utf-8").read(), re.S)[1])
    def in_model(la, lo):
        x, z = (gx(lo) - gx(LNG0)) * MPU, (gy(la) - gy(LAT0)) * MPU
        for o in lm.values():
            if not o.get("L"): continue
            dx, dz, c, s_ = x - o["x"], z - o["z"], math.cos(o["ang"]), math.sin(o["ang"])
            if abs(dx * c + dz * s_) < o["L"] / 2 + 5 and abs(-dx * s_ + dz * c) < o["W"] / 2 + 5: return True
        return False
    by = {}; skipped = 0
    for el in els:
        t = el.get("tags", {}); sp = 5
        for s in (t.get("sport") or "").split(";"):
            if s.strip() in SPORT: sp = SPORT[s.strip()]; break
        if t.get("sport") and ";" in t["sport"] and sp != 1: sp = 4
        sf = SURF.get(t.get("surface", ""), 255)
        for r in rings(el):
            if len(r) < 4: continue
            if r[0] == r[-1]: r = r[:-1]
            la = sum(p[0] for p in r) / len(r); lo = sum(p[1] for p in r) / len(r)
            if in_model(la, lo): skipped += 1; continue
            tk = (int(gx(lo) / SIZE), int(gy(la) / SIZE))
            ox, oz = tk[0] * SIZE, tk[1] * SIZE
            pts = [(round((gx(p[1]) - ox) * MPU * 10), round((gy(p[0]) - oz) * MPU * 10)) for p in r]
            a = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(len(pts)))) / 200
            if a < 40 or a > 30000: continue  # мелочь и большие стадионы (у них свои модели и чаши)
            if sp == 5 and not t.get("sport"):  # вид спорта не указан: дворовое поле — по пропорциям и размеру
                xs = [q[0] for q in pts]; zs = [q[1] for q in pts]; w, h = (max(xs) - min(xs)) / 10, (max(zs) - min(zs)) / 10
                k = max(w, h) / max(1, min(w, h)); sp = 0 if 1.25 < k < 2.6 and a > 250 else 4
            by.setdefault(tk, []).append((sp, sf, pts))
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read(); total = 0; tiles = 0
    for fn in os.listdir(os.path.join(D, "t")):
        m = re.match(r"(\d+)_(\d+)\.js$", fn)
        if not m: continue
        tk = (int(m[1]), int(m[2])); p = os.path.join(D, "t", fn)
        s = open(p, encoding="utf-8", newline="").read(); mm = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
        B = zlib.decompress(base64.b64decode(mm[3])); r = Reader(B); s8 = e8 = None
        while True:
            st = r.P; tag = r.u8()
            if tag == 0: end = st; break
            r.skip(tag)
            if tag == 8: s8, e8 = st, r.P
        body = B[:s8] + B[e8:end] if s8 is not None else B[:end]
        L = by.get(tk, [])
        blk = b""
        if L:
            blk = bytes([8]) + wvar(len(L))
            for sp, sf, pts in L:
                blk += bytes([sp, sf]) + wvar(len(pts)); x = z = 0
                for px, pz in pts: blk += wsv(px - x) + wsv(pz - z); x, z = px, pz
        out = body + blk + B[end:]
        if out == B: continue
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(p, "w", encoding="utf-8", newline="").write(f'TPM_TILE({tk[0]},{tk[1]},"{b64}");{mm[4]}')
        ix, k = re.subn(rf"\[{tk[0]},{tk[1]},\d+,", f"[{tk[0]},{tk[1]},{len(b64)},", ix); assert k == 1
        total += len(L); tiles += 1
    open(ixp, "w", encoding="utf-8", newline="").write(ix)
    from collections import Counter
    print("inside landmark models (skipped):", skipped)
    print("pitches:", total, "in", tiles, "tiles;", dict(Counter(x[0] for L in by.values() for x in L)))


if __name__ == "__main__":
    if sys.argv[1] == "fetch": fetch(sys.argv[2])
    else: bake(sys.argv[2], sys.argv[3])
