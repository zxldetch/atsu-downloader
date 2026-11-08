#!/usr/bin/env python3
"""Generate the placeholder page art used by the mobile app's demo mode.

The demo exists so the UI, download queue, CBZ/PDF export and reader can be
exercised end-to-end without hitting atsu.moe (which is unreachable from CI and
from the sandbox). Everything here is drawn from scratch, so no third-party art
is bundled.

Outputs:
  src/api/demoPages.ts   (6 page images, base64 PNG data URIs)
  src/api/demoCovers.ts  (3 cover images)

Usage: python3 scripts/make_demo_pages.py
"""

from __future__ import annotations

import base64
import io
import math
import random
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT = 720, 1080
COVER_W, COVER_H = 480, 680
ROOT = Path(__file__).resolve().parent.parent
OUT_TS = ROOT / "src" / "api" / "demoPages.ts"
OUT_COVERS = ROOT / "src" / "api" / "demoCovers.ts"

COVERS = [
    ("THE LANTERN COURIER", "a delivery through the rain", (32, 58, 92), (255, 196, 92)),
    ("STATIC BLOOM", "signals in the greenhouse", (30, 74, 62), (122, 231, 191)),
    ("IRON SEASON", "the last forge of winter", (74, 32, 40), (255, 122, 122)),
]

INK = (18, 18, 22)
PAPER = (246, 244, 238)
TONE = (206, 203, 194)


def font(size: int) -> ImageFont.FreeTypeFont:
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def tone_fill(draw: ImageDraw.ImageDraw, box, density: int = 3, seed: int = 0) -> None:
    """Cheap halftone-ish shading."""
    rng = random.Random(seed)
    x0, y0, x1, y1 = box
    step = max(2, density + 2)
    for y in range(int(y0) + 2, int(y1) - 2, step):
        for x in range(int(x0) + 2, int(x1) - 2, step):
            if rng.random() < 0.55:
                draw.ellipse((x, y, x + 1, y + 1), fill=TONE)


def centered(draw, xy, text, fnt, fill=INK) -> None:
    x, y = xy
    bbox = draw.textbbox((0, 0), text, font=fnt)
    draw.text((x - (bbox[2] - bbox[0]) / 2, y), text, font=fnt, fill=fill)


def make_page(index: int) -> Image.Image:
    rng = random.Random(index * 977 + 13)
    img = Image.new("RGB", (WIDTH, HEIGHT), PAPER)
    d = ImageDraw.Draw(img)

    margin = 34
    gutter = 12
    # A small library of panel layouts so consecutive pages look different.
    layouts = [
        # (rows as fractional heights, columns per row)
        [(0.34, [1]), (0.34, [1]), (0.32, [2])],
        [(0.5, [2]), (0.5, [1])],
        [(0.26, [1]), (0.44, [2]), (0.30, [1])],
        [(0.62, [1]), (0.38, [3])],
        [(0.3, [2]), (0.3, [1]), (0.4, [2])],
        [(1.0, [1])],
    ]
    layout = layouts[index % len(layouts)]

    top = margin
    for row_index, (height_fraction, columns) in enumerate(layout):
        row_height = (HEIGHT - 52 - 2 * margin) * height_fraction
        left = margin
        usable = WIDTH - 2 * margin
        col_width = (usable - gutter * (len(columns) - 1)) / len(columns)
        for col_index, _ in enumerate(columns):
            box = (
                left,
                top,
                left + col_width,
                top + row_height,
            )
            if row_index == 0 and col_index == 0:
                pass  # leave the establishing panel open
            elif rng.random() < 0.5:
                tone_fill(d, box, density=4, seed=index * 31 + row_index * 7 + col_index)

            d.rectangle(box, outline=INK, width=6)

            # Suggestion of subject matter inside the panel (pure abstraction).
            cx = (box[0] + box[2]) / 2
            cy = (box[1] + box[3]) / 2
            radius = min(col_width, row_height) * 0.18
            if rng.random() < 0.7:
                d.ellipse(
                    (cx - radius, cy - radius * 1.25, cx + radius, cy + radius * 1.05),
                    outline=INK,
                    width=4,
                )
                d.arc(
                    (cx - radius * 2.1, cy + radius * 0.2, cx + radius * 2.1, cy + radius * 3.4),
                    start=200,
                    end=340,
                    fill=INK,
                    width=4,
                )
            for _ in range(rng.randint(0, 3)):
                sx = rng.uniform(box[0] + 30, box[2] - 30)
                sy = rng.uniform(box[1] + 30, min(box[3] - 30, box[1] + 200))
                d.ellipse((sx, sy, sx + 26, sy + 18), fill=(255, 255, 255), outline=INK, width=3)

            if rng.random() < 0.4:
                # motion lines
                for i in range(5):
                    y = box[1] + 20 + i * 9
                    d.line((box[0] + 10, y, box[0] + 10 + col_width * 0.35, y), fill=INK, width=2)

            left += col_width + gutter
        top += row_height + gutter

    # Page furniture: chapter tag, page number, demo watermark.
    footer_font = font(26)
    header_font = font(22)
    d.rectangle((0, HEIGHT - 52, WIDTH, HEIGHT), fill=INK)
    d.text((margin, HEIGHT - 44), "DEMO PAGE", font=header_font, fill=PAPER)
    centered(d, (WIDTH / 2, HEIGHT - 44), f"— {index + 1} —", footer_font, fill=PAPER)
    d.text((WIDTH - margin - 120, HEIGHT - 44), "atsu mobile", font=header_font, fill=TONE)

    # Subtle vignette so page turns are visually obvious.
    gradient = Image.new("L", (WIDTH, HEIGHT))
    gd = ImageDraw.Draw(gradient)
    for y in range(HEIGHT):
        value = int(28 * (0.5 + 0.5 * math.cos(y / HEIGHT * math.pi * 2)))
        gd.line((0, y, WIDTH, y), fill=value)
    img = Image.composite(Image.new("RGB", (WIDTH, HEIGHT), INK), img, gradient.point(lambda v: v // 6))
    return img


def wrap(draw, text: str, fnt, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        width = draw.textbbox((0, 0), candidate, font=fnt)[2]
        if width <= max_width or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def make_cover(title: str, subtitle: str, bg, accent) -> Image.Image:
    img = Image.new("RGB", (COVER_W, COVER_H), bg)
    d = ImageDraw.Draw(img)

    # Geometric backdrop: concentric arcs + a horizon band.
    for i in range(7):
        inset = 26 + i * 26
        d.arc(
            (inset, COVER_H * 0.12 + inset, COVER_W - inset, COVER_H * 0.12 + COVER_W - inset),
            start=200,
            end=340,
            fill=accent,
            width=2,
        )
    d.rectangle((0, COVER_H * 0.62, COVER_W, COVER_H * 0.66), fill=accent)
    d.rectangle((0, COVER_H * 0.66, COVER_W, COVER_H), fill=tuple(max(0, c - 14) for c in bg))

    title_font = font(40)
    sub_font = font(21)
    y = COVER_H * 0.68
    for line in wrap(d, title, title_font, COVER_W - 68):
        d.text((34, y), line, font=title_font, fill=(255, 255, 255))
        y += 46
    d.text((36, y + 10), subtitle, font=sub_font, fill=accent)
    d.text((36, COVER_H - 40), "DEMO COVER", font=font(16), fill=(255, 255, 255))
    d.rectangle((0, 0, COVER_W - 1, COVER_H - 1), outline=accent, width=6)
    return img


def main() -> None:
    pages = []
    for i in range(6):
        page = make_page(i)
        buf = io.BytesIO()
        page.save(buf, format="PNG", optimize=True)
        encoded = base64.b64encode(buf.getvalue()).decode("ascii")
        pages.append(encoded)
        print(f"page {i + 1}: {len(buf.getvalue()) / 1024:.0f} KiB raw, {len(encoded) / 1024:.0f} KiB base64")

    OUT_TS.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "// AUTO-GENERATED by scripts/make_demo_pages.py — do not edit by hand.",
        "// Placeholder page art for demo mode; drawn from scratch so nothing third-party ships.",
        "",
        "export const DEMO_PAGES: string[] = [",
    ]
    for encoded in pages:
        lines.append(f'  "data:image/png;base64,{encoded}",')
    lines.append("];")
    lines.append("")
    OUT_TS.write_text("\n".join(lines), encoding="utf-8")
    print(f"wrote {OUT_TS}")

    covers = []
    for title, subtitle, bg, accent in COVERS:
        buf = io.BytesIO()
        make_cover(title, subtitle, bg, accent).save(buf, format="PNG", optimize=True)
        covers.append(base64.b64encode(buf.getvalue()).decode("ascii"))

    cover_lines = [
        "// AUTO-GENERATED by scripts/make_demo_pages.py — do not edit by hand.",
        "// Placeholder cover art for demo mode.",
        "",
        "export const DEMO_COVERS: string[] = [",
    ]
    for encoded in covers:
        cover_lines.append(f'  "data:image/png;base64,{encoded}",')
    cover_lines.append("];")
    cover_lines.append("")
    OUT_COVERS.write_text("\n".join(cover_lines), encoding="utf-8")
    print(f"wrote {OUT_COVERS}")


if __name__ == "__main__":
    main()
