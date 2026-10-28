# =====================================================================
#  Перекраска зданий в уже запечённых тайлах по палитре из palette.py —
#  без повторной загрузки OSM. Меняются только цвета «по умолчанию» из старой
#  палитры; цвета из тегов OSM (building:colour / roof:colour) и купола остаются.
#  Запуск:  python tools/bake/recolor.py data
# =====================================================================
import base64, os, re, sys, zlib
sys.path.insert(0, os.path.dirname(__file__))
from palette import roof_color, wall_color

OLD_WALL = {0xe2dcce, 0xd6ccb6, 0xcec8be, 0xc4baa6, 0xe8e2d4, 0xdaccb0, 0xccb692, 0xb67c5e, 0xe2d8c2,
            0xd2c4aa, 0xe0dace, 0xd0ccc4, 0xd8cab2, 0xc6c8c8, 0xe4ded0, 0xbeb4a4, 0xc4d0d8, 0xacbcc8, 0x98acbc,
            0xb2aea6, 0xa2a09a, 0xc0baae, 0xd6c098, 0xe4d8be, 0xd6c6a4, 0xdcd2c4, 0xaaa69e, 0xe6e0d6, 0xdcc8a0, 0xbab4aa,
            0xded8ce}
OLD_ROOF = {0x768c8a, 0x969692, 0x804c3e, 0x5c7a8e, 0xacaca2, 0x68745c, 0x965a46,
            0x96928c, 0x84827e, 0xa8a298, 0x7a7874, 0x8e8a80, 0xb0b0aa}


def recolor(B):
    P = 0
    def u8():
        nonlocal P; v = B[P]; P += 1; return v
    def vr():
        r = s = 0
        while True:
            c = u8(); r += (c & 127) << s; s += 7
            if c < 128: return r
    def sv(): n = vr(); return -(n + 1) // 2 if n % 2 else n // 2
    def skip_pts():
        for _ in range(2 * vr()): vr()
    out = bytearray(B); changed = 0
    while True:
        tag = u8()
        if tag == 0: break
        if tag == 1:
            for _ in range(vr()):
                u8()
                for _ in range(vr()): skip_pts()
        elif tag == 2:
            for _ in range(vr()): u8(); u8(); skip_pts()
        elif tag == 3:
            for _ in range(vr()):
                h = vr() / 10; vr(); roof = u8(); vr()
                cpos = P; P += 6; kind = u8()
                n = vr(); x = y = 0; pts = []
                for _ in range(n): x += sv(); y += sv(); pts.append((x, y))
                a = abs(sum(pts[i][0] * pts[i - 1][1] - pts[i - 1][0] * pts[i][1] for i in range(n))) / 200  # дм² → м²
                seed = 0
                for px, py in pts[:6]: seed = (seed * 31 + px * 7919 + py * 104729) & 0xffffffff
                wall = int.from_bytes(B[cpos:cpos + 3], "big"); rc = int.from_bytes(B[cpos + 3:cpos + 6], "big")
                if wall in OLD_WALL: out[cpos:cpos + 3] = wall_color(kind, h, a, seed).to_bytes(3, "big"); changed += 1
                if rc in OLD_ROOF: out[cpos + 3:cpos + 6] = roof_color(kind, roof, h, a, seed).to_bytes(3, "big"); changed += 1
        else:
            break  # здания идут раньше деревьев и прочего — дальше не нужно
    return bytes(out), changed


def main(data):
    ix_path = os.path.join(data, "index.js")
    ix = open(ix_path, encoding="utf-8", newline="").read()
    total = 0
    for fn in sorted(os.listdir(os.path.join(data, "t"))):
        p = os.path.join(data, "t", fn)
        s = open(p, encoding="utf-8", newline="").read()
        m = re.match(r'TPM_TILE\((\d+),(\d+),"([^"]+)"\);(\r?\n)$', s)
        B, n = recolor(zlib.decompress(base64.b64decode(m[3])))
        if not n: continue
        b64 = base64.b64encode(zlib.compress(B, 9)).decode()
        open(p, "w", encoding="utf-8", newline="").write(f'TPM_TILE({m[1]},{m[2]},"{b64}");{m[4]}')
        ix = re.sub(rf"\[{m[1]},{m[2]},\d+,", f"[{m[1]},{m[2]},{len(b64)},", ix)
        total += n
    open(ix_path, "w", encoding="utf-8", newline="").write(ix)
    print("recolored", total, "buildings")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "data")
