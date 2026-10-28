#!/usr/bin/env python3
"""Выгрузка зданий и мелких слоёв OSM через Overpass (квадратами, с повторами)."""
import json, os, sys, time, random, urllib.request, urllib.parse, concurrent.futures as cf
OUT = sys.argv[1]
EP = ["https://maps.mail.ru/osm/tools/overpass/api/interpreter"]
UA = {"User-Agent": "Mozilla/5.0 (tashkent-pixel-map bake)"}
KEEP = ("building", "building:levels", "height", "min_height", "building:min_level", "roof:shape", "roof:levels",
        "roof:colour", "building:colour", "building:material", "name", "name:ru", "amenity", "religion", "levels", "building:part")
def q(query, tries=12):
    for t in range(tries):
        try:
            u = EP[0] + "?" + urllib.parse.urlencode({"data": query})
            b = urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=200).read()
            if b[:1] == b"{": return json.loads(b)
        except Exception as e:
            pass
        time.sleep(2 + random.random() * 4)
    return None
def slim(el):
    t = el.get("tags", {})
    o = {"t": {k: v for k, v in t.items() if k in KEEP}}
    if el["type"] == "way":
        o["g"] = [[round(p["lat"], 7), round(p["lon"], 7)] for p in el.get("geometry", [])]
    else:
        o["m"] = [{"r": m.get("role", ""), "g": [[round(p["lat"], 7), round(p["lon"], 7)] for p in m.get("geometry", [])]}
                  for m in el.get("members", []) if m.get("type") == "way" and m.get("geometry")]
    o["id"] = el["type"][0] + str(el["id"])
    return o
def box(job):
    i, j, s, w, n, e = job
    p = os.path.join(OUT, f"b_{i}_{j}.json")
    if os.path.exists(p): return "skip"
    d = q(f'[out:json][timeout:90];(way["building"]({s},{w},{n},{e});rel["building"]({s},{w},{n},{e});way["building:part"]({s},{w},{n},{e}););out geom;')
    if d is None: return "fail"
    json.dump([slim(x) for x in d["elements"]], open(p, "w"), separators=(",", ":"))
    return len(d["elements"])
if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    S, W, N, E, DLA, DLO = 41.13, 69.08, 41.47, 69.72, 0.02, 0.025
    jobs = []
    i = 0; la = S
    while la < N:
        j = 0; lo = W
        while lo < E:
            jobs.append((i, j, round(la, 4), round(lo, 4), round(min(N, la + DLA), 4), round(min(E, lo + DLO), 4))); lo += DLO; j += 1
        la += DLA; i += 1
    # центр города — первым
    jobs.sort(key=lambda b: (b[2] - 41.31) ** 2 + ((b[3] - 69.27) * 0.75) ** 2, reverse=len(sys.argv) > 2 and sys.argv[2] == "rev")
    done = 0; tot = 0; fails = []
    with cf.ThreadPoolExecutor(6) as ex:
        for job, r in zip(jobs, ex.map(box, jobs)):
            done += 1
            if r == "fail": fails.append(job)
            elif isinstance(r, int): tot += r
            if done % 20 == 0: print(f"{done}/{len(jobs)} boxes, {tot} buildings, {len(fails)} fails", flush=True)
    print("DONE", done, tot, "fails:", len(fails), flush=True)
