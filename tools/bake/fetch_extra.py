#!/usr/bin/env python3
"""Светофоры, отдельные деревья (natural=tree) и границы районов Ташкента из Overpass."""
import json, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from fetch_osm import q
OUT = sys.argv[1]
BB = "41.13,69.08,41.47,69.72"
res = {}
d = q(f'[out:json][timeout:120];node["highway"="traffic_signals"]({BB});out skel qt;', 20)
res["signals"] = [[e["lat"], e["lon"]] for e in d["elements"]] if d else []
print("signals", len(res["signals"]), flush=True)
d = q(f'[out:json][timeout:150];node["natural"="tree"]({BB});out skel qt;', 20)
res["trees"] = [[e["lat"], e["lon"]] for e in d["elements"]] if d else []
print("trees", len(res["trees"]), flush=True)
d = q('[out:json][timeout:150];rel["boundary"="administrative"]["admin_level"="4"]["name:en"~"^Tashkent( City)?$"](41.0,69.0,41.6,69.9)->.c;.c out geom;.c map_to_area->.a;rel(area.a)["boundary"="administrative"]["admin_level"~"^(5|6|7|8)$"];out geom;', 20)
res["admin"] = []
if d:
    for el in d["elements"]:
        t = el.get("tags", {})
        res["admin"].append({"lvl": t.get("admin_level"), "name": t.get("name:ru") or t.get("name"), "uz": t.get("name:uz") or t.get("name"),
                             "m": [{"r": m.get("role", ""), "g": [[p["lat"], p["lon"]] for p in m.get("geometry", [])]} for m in el.get("members", []) if m.get("type") == "way" and m.get("geometry")]})
print("admin", len(res["admin"]), [(a["lvl"], a["name"]) for a in res["admin"]][:20], flush=True)
json.dump(res, open(os.path.join(OUT, "extra.json"), "w"))
