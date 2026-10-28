# =====================================================================
#  Сквозные профили мостов и тоннелей через границы тайлов.
#  Фоновый поток считает высоту моста по куску внутри одного тайла и не знает,
#  где у него съезд в соседнем тайле, — на стыке получается ступенька. Здесь
#  цепочки склеиваются по всему городу, профиль считается целиком (те же правила,
#  что profiles() в js/geo-worker.js), и для линий, пересекающих край тайла,
#  готовые высоты вершин пишутся в тайл блоком 7 (перед линиями, блоком 2).
#  Запуск после bake.py:  python tools/bake/seams.py data
# =====================================================================
import base64, heapq, math, os, re, sys, zlib
from collections import defaultdict

LAT0, LNG0, Z = 41.3111, 69.2797, 14
MPU = 40075016.686 * math.cos(math.radians(LAT0)) / 256
SIZE = 256 / 2 ** Z
T = SIZE * MPU
def gx(l): return (l + 180) / 360 * 256
def gy(la): s = math.sin(math.radians(la)); return (0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 256


class Reader:
    def __init__(self, B): self.B, self.P = B, 0
    def u8(self): v = self.B[self.P]; self.P += 1; return v
    def vr(self):
        r = s = 0
        while True:
            c = self.u8(); r += (c & 127) << s; s += 7
            if c < 128: return r
    def sv(self): n = self.vr(); return -(n + 1) // 2 if n % 2 else n // 2
    def pts(self):
        n = self.vr(); x = z = 0; o = []
        for _ in range(n): x += self.sv(); z += self.sv(); o.append((x / 10, z / 10))
        return o


def wvar(n):
    o = bytearray()
    while n >= 128: o.append(n & 127 | 128); n >>= 7
    o.append(n); return bytes(o)
def wsv(v): return wvar(v * 2 if v >= 0 else -v * 2 - 1)


def split(B):
    """(начало блока 2, конец блока 7 или None, линии)"""
    r = Reader(B); s7 = e7 = None
    while True:
        st = r.P; tag = r.u8()
        if tag == 1:
            for _ in range(r.vr()): r.u8(); [r.pts() for _ in range(r.vr())]
        elif tag == 7:
            for _ in range(r.vr()): r.vr(); [r.sv() for _ in range(r.vr())]
            s7, e7 = st, r.P
        elif tag == 2:
            L = []
            for _ in range(r.vr()): c = r.u8(); f = r.u8(); L.append((c, f, r.pts()))
            return st, (s7, e7), L
        else: raise ValueError("unexpected tag %d" % tag)


def sm(x): return 0 if x <= 0 else 1 if x >= 1 else x * x * (3 - 2 * x)
def kind(f): return 2 if f & 2 else 8 if f & 8 else 0


def main(D):
    tiles = {}
    for fn in os.listdir(os.path.join(D, "t")):
        m = re.match(r"(\d+)_(\d+)\.js$", fn)
        if not m: continue
        s = open(os.path.join(D, "t", fn), encoding="utf-8", newline="").read()
        mm = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
        B = zlib.decompress(base64.b64decode(mm[3]))
        tiles[(int(m[1]), int(m[2]))] = (B, mm[4], split(B))
    # все мосты/тоннели в мировых координатах
    LN = []  # (tile, idx, cls, fl, [(wx, wz)], [(lx, lz)])
    for (tx, ty), (_, _, (_, _, L)) in tiles.items():
        ox, oz = tx * SIZE * MPU - gx(LNG0) * MPU, ty * SIZE * MPU - gy(LAT0) * MPU
        for i, (c, f, l) in enumerate(L):
            if kind(f) and c < 13 and c != 8: LN.append(((tx, ty), i, c, f, [(ox + x, oz + z) for x, z in l], l))
    # концы линий одного вида, совпадающие в пределах 1,5 м, — одна точка цепочки
    grid = defaultdict(list); node = {}
    def nid(k, p):
        g = (k, round(p[0] / 3), round(p[1] / 3))
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                for q, n in grid[(k, g[1] + dx, g[2] + dz)]:
                    if math.hypot(q[0] - p[0], q[1] - p[1]) < 1.5: return n
        n = len(node); node[n] = p; grid[g].append((p, n)); return n
    ends = defaultdict(list)
    for li, (tk, i, c, f, w, l) in enumerate(LN):
        k = kind(f); a, b = nid(k, w[0]), nid(k, w[-1]); LN[li] = LN[li] + (a, b); ends[a].append(li); ends[b].append(li)
    par = list(range(len(LN)))
    def find(i):
        while par[i] != i: par[i] = par[par[i]]; i = par[i]
        return i
    for lst in ends.values():
        for x in lst[1:]: par[find(x)] = find(lst[0])
    onE = lambda p: p[0] < 0.6 or p[1] < 0.6 or p[0] > T - 0.6 or p[1] > T - 0.6
    seg = lambda w: [math.hypot(w[j][0] - w[j - 1][0], w[j][1] - w[j - 1][1]) for j in range(1, len(w))]
    chains = defaultdict(list)
    for li in range(len(LN)): chains[find(li)].append(li)
    over = defaultdict(dict); n_over = 0
    for ch in chains.values():
        if not any(onE(LN[li][5][0]) or onE(LN[li][5][-1]) for li in ch): continue      # целиком внутри тайла — поток посчитает сам
        cl = sum(sum(seg(LN[li][4])) for li in ch)
        # свободные концы: к точке подходит одна линия и это не внешняя граница города
        free = []
        for li in ch:
            tk, i, c, f, w, l, a, b = LN[li]
            for n, p in ((a, l[0]), (b, l[-1])):
                if len(ends[n]) > 1: continue
                if onE(p):  # на краю тайла без продолжения: свободен, только если соседний тайл есть
                    sx =-1 if p[0] < 0.6 else 1 if p[0] > T - 0.6 else 0; sz = -1 if p[1] < 0.6 else 1 if p[1] > T - 0.6 else 0
                    if (tk[0] + sx, tk[1] + sz) not in tiles: continue
                free.append(n)
        # расстояние по цепочке до ближайшего свободного конца (Дейкстра по вершинам)
        adj = defaultdict(list); vid = {}
        for li in ch:
            w = LN[li][4]; a, b = LN[li][6], LN[li][7]; S = seg(w)
            ids = [("n", a)] + [("v", li, j) for j in range(1, len(w) - 1)] + [("n", b)]
            for j in range(len(ids) - 1): adj[ids[j]].append((ids[j + 1], S[j])); adj[ids[j + 1]].append((ids[j], S[j]))
            vid[li] = ids
        dist = defaultdict(lambda: 1e9); pq = []
        for n in free: dist[("n", n)] = 0; heapq.heappush(pq, (0, ("n", n)))
        while pq:
            d, u = heapq.heappop(pq)
            if d > dist[u]: continue
            for v, wgt in adj[u]:
                if d + wgt < dist[v]: dist[v] = d + wgt; heapq.heappush(pq, (d + wgt, v))
        for li in ch:
            tk, i, c, f, w, l, a, b = LN[li]; k = kind(f)
            if k == 2: Hm = 0.8 if cl < 30 else min(13 if f & 16 else 6.8, 0.9 + cl / 8); R = max(8, min(110 if f & 16 else 75, cl * 0.36))
            else: Hm = -7; R = max(10, min(45, cl * 0.3))
            over[tk][i] = [round(Hm * sm(dist[v] / R) * 10) for v in vid[li]]; n_over += 1
    # запись: блок 7 перед блоком 2
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read(); changed = 0
    for tk, (B, nl, (s2, (s7, e7), _)) in tiles.items():
        body = B[:s7] + B[e7:s2] if s7 is not None else B[:s2]
        if s7 is not None and s7 > s2: raise ValueError("block 7 after block 2")
        blk = b""
        if over.get(tk):
            blk = bytes([7]) + wvar(len(over[tk])) + b"".join(wvar(i) + wvar(len(h)) + b"".join(wsv(v) for v in h) for i, h in sorted(over[tk].items()))
        out = body + blk + B[s2:]
        if out == B: continue
        b64 = base64.b64encode(zlib.compress(out, 9)).decode()
        open(os.path.join(D, "t", f"{tk[0]}_{tk[1]}.js"), "w", encoding="utf-8", newline="").write(f'TPM_TILE({tk[0]},{tk[1]},"{b64}");{nl}')
        ix, k = re.subn(rf"\[{tk[0]},{tk[1]},\d+,", f"[{tk[0]},{tk[1]},{len(b64)},", ix); assert k == 1
        changed += 1
    open(ixp, "w", encoding="utf-8", newline="").write(ix)
    print("chains across tiles:", sum(1 for ch in chains.values() if any(onE(LN[li][5][0]) or onE(LN[li][5][-1]) for li in ch)), "| lines with profiles:", n_over, "| tiles rewritten:", changed)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data")
