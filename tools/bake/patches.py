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
    # IT Park (ул. Муминова): башни, подиумы и корпуса — модель it_park
    {"tile": (11347, 6122), "hide": [[4756, -3382], [4733, -3356], [4647, -3375], [4677, -3349], [4782, -3474], [4725, -3466], [4620, -3461], [4587, -3420], [4743, -3364], [4669, -3353], [4753, -3465], [4683, -3498], [4644, -3493], [4666, -3477], [4700, -3552]]},
    # площадь Хамида Алимджана, восточная сторона: четыре 18-этажки и изогнутый бизнес-комплекс — модель hamid_olimjon
    {"tile": (11345, 6123), "hide": [[1173, -864], [1215, -881], [1258, -872], [1287, -842], [1227, -833]]},
    # вантовый пешеходный мост через Анхор у парка «Навруз» («знак бесконечности»): верхний настил и две
    # петли-пандуса — модель navruz_bridge; линии мостов OSM убираем (drop_lines: x, z, радиус),
    # заодно деревья в 3 м от них, чтобы не прорастали сквозь настил
    {"tile": (11344, 6123), "drop_lines": (-822, -1530, 60)},
    # бизнес-парк Trilliant (ул. Шахрисабз, 2): офисные башни, отель InterContinental и подиум — модель trilliant
    {"tile": (11345, 6123), "hide": [[177, -545], [176, -525], [260, -525], [256, -504], [235, -463], [245, -438], [218, -475]]},
    # исторический кирпичный корпус Вестминстерского университета (ул. Истикбол, 12) — модель wiut
    {"tile": (11345, 6124), "hide": [[298, 454]]},
    # площадь Хамида Алимджана, западная сторона: такие же четыре 18-этажки и изогнутый корпус — hamid_olimjon_w
    {"tile": (11345, 6123), "hide": [[944, -662], [944, -722], [915, -692], [902, -650], [917, -611]]},
    # бывшее здание «Узбекэнерго» (Минэнерго, ул. Истиклол, 6) у сквера Амира Темура — модель uzbekenergo
    {"tile": (11345, 6123), "hide": [[165, -278]]},
    # гостиница City Palace (Амира Темура, 15) с купольным рестораном — модель city_palace;
    # Hyatt Regency Tashkent (Навои, 1А) с банкетным крылом — модель hyatt
    {"tile": (11344, 6123), "hide": [[6, -570], [-132, -583], [-199, -605]]},
    {"tile": (11345, 6123), "hide": [[23, -528], [37, -565]]},
    # квартал у дворца Романова: БЦ «Пойтахт», Национальная библиотека, Дворец творчества молодёжи,
    # Галерея изобразительного искусства и Монетный двор — модели poytaxt, nat_library, youth_palace, art_gallery, mint
    # Дом печати «Шарк» и УзА (Буюк Турон, 41) с типографскими корпусами — модель sharq;
    # Государственный музей истории Узбекистана (бывший музей Ленина) — модель history_museum
    {"tile": (11344, 6123), "hide": [[-771, -5], [-641, -58], [-693, -29], [-640, 19], [-752, -63], [-867, -47], [-865, -49]]},
    {"tile": (11344, 6124), "hide": [[-703, 69], [-716, 44]]},
    # бывшие Мужская и Женская гимназии (Сайилгох, 35; ныне корпуса Юридического университета) — модель gymnasia
    {"tile": (11344, 6123), "hide": [[-126, -130], [-175, 2]]},
    # квартал на ул. Бухоро к югу от сквера: биржа «Тошкент» с куполом, Beeline, «Узавтосаноат», новые башни и др. — модель buxoro
    # бывший Ташкентский кадетский корпус (1902–1904, ныне Академия вооружённых сил, ул. Паркентская, 2) — модель cadet_corps
    {"tile": (11346, 6123), "hide": [[2472, -719]]},
    {"tile": (11344, 6124), "hide": [[-205, 227], [-205, 228], [-162, 317], [-298, 276], [-350, 196], [-292, 216], [-264, 191], [-312, 173], [-264, 215], [-108, 430], [-140, 562], [-290, 429], [-336, 318], [-83, 266]]},
    {"tile": (11344, 6123), "hide": [[-627, -736], [-655, -746], [-599, -726], [-665, -750], [-587, -723], [-428, -682], [-584, -447], [-581, -459], [-706, -492], [-448, -388]]},
]


def inside(poly, x, z):
    c = False
    for i in range(len(poly)):
        (x1, z1), (x2, z2) = poly[i], poly[i - 1]
        if (z1 > z) != (z2 > z) and x < (x2 - x1) * (z - z1) / (z2 - z1) + x1: c = not c
    return c


def seg_d(x, z, l):
    best = 1e9
    for (ax, az), (bx, bz) in zip(l, l[1:]):
        dx, dz = bx - ax, bz - az; q = dx * dx + dz * dz or 1; t = max(0, min(1, ((x - ax) * dx + (z - az) * dz) / q))
        best = min(best, math.hypot(x - ax - dx * t, z - az - dz * t))
    return best


def main(D):
    by = {}
    for p in PATCHES: by.setdefault(p["tile"], []).append(p)
    ixp = os.path.join(D, "index.js"); ix = open(ixp, encoding="utf-8", newline="").read()
    for (tx, ty), PS in by.items():
        path, mm, B = load(D, tx, ty); ox, oz = (tx * SIZE - gx(LNG0)) * MPU, (ty * SIZE - gy(LAT0)) * MPU
        r = Dec(B); out = b""; clear = []
        hide = [q for p in PS for q in p.get("hide", [])]
        drops = [p["drop_lines"] for p in PS if "drop_lines" in p]
        drop, dl = set(), []  # индексы убираемых линий (блок 7 ссылается на них по номеру — перенумеруем)
        if drops:
            q = Dec(B)
            while True:
                t = q.u8()
                if t == 0: break
                if t != 2: q.skip(t); continue
                for i in range(q.vr()):
                    c = q.u8(); fl = q.u8(); pts = [(x + ox, z + oz) for x, z in q.ptsl()]
                    if c == 8 and fl & 2 and any(all(math.hypot(x - a, z - b) < rr for x, z in pts) for a, b, rr in drops): drop.add(i); dl.append(pts)
            print("drop lines", sorted(drop))
        remap = lambda i: i - sum(1 for d in drop if d < i)
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
            elif tag == 7 and drop:
                n = r.vr(); seg = bytearray(); kept = 0
                for _ in range(n):
                    i = r.vr(); m = r.vr(); a = r.P
                    for _ in range(m): r.vr()
                    if i in drop: continue
                    seg += wvar(remap(i)) + wvar(m) + B[a:r.P]; kept += 1
                out += bytes([7]) + wvar(kept) + bytes(seg)
            elif tag == 2 and drop:
                n = r.vr(); seg = bytearray()
                for i in range(n):
                    a = r.P; r.u8(); r.u8(); r.ptsl()
                    if i not in drop: seg += B[a:r.P]
                out += bytes([2]) + wvar(n - len(drop)) + bytes(seg)
            elif tag == 4:
                n = r.vr(); x = z = 0; T = []
                for _ in range(n): x += r.sv(); z += r.sv(); T.append((x, z, r.u8()))
                keep = []
                for x, z, c in T:
                    wx, wz = x / 10 + ox, z / 10 + oz
                    if any(inside(w, wx, wz) and (hash((x, z)) % 1000) / 1000 >= k for w, k in clear): continue
                    if any(math.hypot(wx - a_, wz - b_) < rr for a_, b_, rr in circles): continue
                    if any(seg_d(wx, wz, l) < 3 for l in dl): continue
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
