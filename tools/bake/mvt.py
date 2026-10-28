"""Минимальный декодер Mapbox Vector Tile (protobuf) на чистом Python."""
import struct
def _varint(b, i):
    r = s = 0
    while True:
        c = b[i]; i += 1; r |= (c & 0x7f) << s
        if c < 0x80: return r, i
        s += 7
def _zz(n): return (n >> 1) ^ -(n & 1)
def _fields(b, i, end):
    while i < end:
        tag, i = _varint(b, i); f, t = tag >> 3, tag & 7
        if t == 0: v, i = _varint(b, i)
        elif t == 1: v = b[i:i + 8]; i += 8
        elif t == 2:
            l, i = _varint(b, i); v = (i, i + l); i += l
        elif t == 5: v = b[i:i + 4]; i += 4
        else: raise ValueError(t)
        yield f, t, v
def _value(b, s, e):
    for f, t, v in _fields(b, s, e):
        if f == 1: return b[v[0]:v[1]].decode("utf-8", "replace")
        if f == 2: return struct.unpack("<f", v)[0]
        if f == 3: return struct.unpack("<d", v)[0]
        if f in (4, 5): return v
        if f == 6: return _zz(v)
        if f == 7: return bool(v)
def _packed(b, s, e):
    out = []; i = s
    while i < e:
        v, i = _varint(b, i); out.append(v)
    return out
def geometry(cmds):
    parts = []; cur = None; x = y = 0; i = 0
    while i < len(cmds):
        c = cmds[i]; i += 1; cmd, n = c & 7, c >> 3
        if cmd in (1, 2):
            for _ in range(n):
                x += _zz(cmds[i]); y += _zz(cmds[i + 1]); i += 2
                if cmd == 1: cur = []; parts.append(cur)
                cur.append((x, y))
        elif cmd == 7 and cur: cur.append(cur[0])
    return parts
def decode(b):
    layers = {}
    for f, t, v in _fields(b, 0, len(b)):
        if f != 3: continue
        name = None; keys = []; vals = []; feats = []; ext = 4096
        for f2, t2, v2 in _fields(b, v[0], v[1]):
            if f2 == 1: name = b[v2[0]:v2[1]].decode()
            elif f2 == 2: feats.append(v2)
            elif f2 == 3: keys.append(b[v2[0]:v2[1]].decode())
            elif f2 == 4: vals.append(_value(b, *v2))
            elif f2 == 5: ext = v2
        out = []
        for s, e in feats:
            props = {}; typ = 0; cmds = []
            for f3, t3, v3 in _fields(b, s, e):
                if f3 == 2:
                    tg = _packed(b, *v3)
                    for k in range(0, len(tg), 2): props[keys[tg[k]]] = vals[tg[k + 1]]
                elif f3 == 3: typ = v3
                elif f3 == 4: cmds = _packed(b, *v3)
            out.append((typ, props, geometry(cmds)))
        layers[name] = {"extent": ext, "features": out}
    return layers
