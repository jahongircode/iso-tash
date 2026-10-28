#!/usr/bin/env python3
"""Скачивает векторные тайлы OpenStreetMap (OpenFreeMap, z14) для всего Ташкента в кэш."""
import json, math, os, sys, gzip, urllib.request, concurrent.futures as cf
OUT = sys.argv[1] if len(sys.argv) > 1 else "raw"
B = dict(s=41.13, w=69.08, n=41.47, e=69.72)
Z = 14
def tx(lng): return int((lng + 180) / 360 * 2**Z)
def ty(lat):
    s = math.sin(math.radians(lat)); return int((0.5 - math.log((1 + s) / (1 - s)) / (4 * math.pi)) * 2**Z)
UA = {"User-Agent": "Mozilla/5.0 (tashkent-pixel-map bake)"}
tj = json.load(urllib.request.urlopen(urllib.request.Request("https://tiles.openfreemap.org/planet", headers=UA)))
url = tj["tiles"][0]
os.makedirs(OUT, exist_ok=True)
json.dump({"tiles": url}, open(os.path.join(OUT, "source.json"), "w"))
jobs = [(x, y) for x in range(tx(B["w"]), tx(B["e"]) + 1) for y in range(ty(B["n"]), ty(B["s"]) + 1)]
def get(xy):
    x, y = xy
    p = os.path.join(OUT, f"{Z}_{x}_{y}.pbf")
    if os.path.exists(p): return 0
    for attempt in range(4):
        try:
            req = urllib.request.Request(url.format(z=Z, x=x, y=y), headers={"Accept-Encoding": "gzip", "User-Agent": UA["User-Agent"]})
            r = urllib.request.urlopen(req, timeout=60); b = r.read()
            if b[:2] == b"\x1f\x8b": b = gzip.decompress(b)
            open(p, "wb").write(b); return len(b)
        except Exception as e:
            err = e
    print("FAIL", x, y, err); return -1
with cf.ThreadPoolExecutor(12) as ex:
    sizes = list(ex.map(get, jobs))
print(len(jobs), "tiles,", sum(s for s in sizes if s > 0) // 1024, "KB downloaded")
