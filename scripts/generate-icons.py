#!/usr/bin/env python3
"""Generates the PWA icons.

Kept as a script rather than committed-only binaries so the mark can be
regenerated when the palette changes. Pure stdlib: a small PNG encoder plus 3x
supersampling for the antialiased edges. Run from the repo root:

    python3 scripts/generate-icons.py
"""

import math
import struct
import zlib
from pathlib import Path

BACKGROUND = (13, 13, 20)
RING = (239, 164, 42)
GLYPH = (255, 208, 138)
SUPERSAMPLE = 3


def _blend(dst, src, alpha):
    return tuple(round(d + (s - d) * alpha) for d, s in zip(dst, src))


def _rounded_square_mask(x, y, size, radius):
    """Signed coverage test for a rounded square inset from the canvas edge."""
    inset = size * 0.06
    lo, hi = inset, size - inset
    if x < lo or x > hi or y < lo or y > hi:
        return False
    cx = min(max(x, lo + radius), hi - radius)
    cy = min(max(y, lo + radius), hi - radius)
    return (x - cx) ** 2 + (y - cy) ** 2 <= radius**2


def _play_triangle(x, y, size):
    """Equilateral-ish play glyph, optically centred inside the ring."""
    cx, cy = size * 0.5, size * 0.5
    r = size * 0.19
    # Nudge left so the triangle's centre of mass sits on the optical centre.
    px, py = x - cx + size * 0.02, y - cy
    for angle in (180, 300, 60):
        rad = math.radians(angle)
        nx, ny = math.cos(rad), math.sin(rad)
        if px * nx + py * ny > r * 0.5:
            return False
    return True


def _ring(x, y, size):
    cx, cy = size * 0.5, size * 0.5
    d = math.hypot(x - cx, y - cy)
    outer = size * 0.34
    inner = size * 0.27
    return inner <= d <= outer


def render(size, maskable=False):
    rows = []
    radius = size * (0.5 if maskable else 0.22)
    step = 1.0 / SUPERSAMPLE
    for py in range(size):
        row = bytearray()
        for px in range(size):
            bg_hits = ring_hits = glyph_hits = 0
            for sy in range(SUPERSAMPLE):
                for sx in range(SUPERSAMPLE):
                    x = px + (sx + 0.5) * step
                    y = py + (sy + 0.5) * step
                    if maskable or _rounded_square_mask(x, y, size, radius):
                        bg_hits += 1
                    if _ring(x, y, size):
                        ring_hits += 1
                    if _play_triangle(x, y, size):
                        glyph_hits += 1
            total = SUPERSAMPLE**2
            colour = BACKGROUND
            alpha = bg_hits / total
            colour = _blend(BACKGROUND, RING, ring_hits / total)
            colour = _blend(colour, GLYPH, glyph_hits / total)
            row += bytes((*colour, round(alpha * 255)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    path.write_bytes(png)


def main():
    out = Path(__file__).resolve().parent.parent / "public" / "icons"
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        write_png(out / f"icon-{size}.png", render(size), size)
    write_png(out / "icon-maskable-512.png", render(512, maskable=True), 512)
    write_png(out / "apple-touch-icon.png", render(180), 180)
    print(f"icons written to {out}")


if __name__ == "__main__":
    main()
