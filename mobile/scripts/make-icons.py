#!/usr/bin/env python3
"""Draw the Atsu Offline icon set.

The artwork is `assets/logo-source.png` — a dark "A" with two violet slashes,
supplied as a transparent PNG. It goes on a **dark grey** rounded-square plate, so
the icon reads as a shape of its own rather than a floating glyph.

The supplied art is dark, which would vanish on a dark plate, so the mark is
recoloured on the way in: the ink becomes near-white and only the slashes keep
their violet (see `recolour_mark`). The plate stays dark at the user's request.

If the source file is missing, a drawn wifi-fan mark is used instead, so the
script still produces something sensible.

Run from mobile/:  python3 scripts/make-icons.py
Needs Pillow (`pip install pillow`). The output files are committed, so this only
has to run when the artwork changes.
"""

from __future__ import annotations

import math
import pathlib

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent.parent
ASSETS = HERE / "assets"

INK = (13, 14, 18)            # #0D0E12 — the app's canvas
PLATE_TOP = (62, 65, 72)      # #3E4148 — dark grey, the user's choice
PLATE_BOTTOM = (24, 25, 30)   # #18191E
PLATE_RIM = (255, 255, 255)   # a hairline; only the alpha is used
SLASH = (36, 30, 72)          # deep violet ink, for the fallback mark

# The mark, repainted for a dark plate.
MARK_LIGHT = (242, 243, 247)  # the A, near-white
MARK_ACCENT = (169, 139, 255)  # #A98BFF — the slashes, brightened

LOGO = ASSETS / "logo-source.png"
WHITE = (255, 255, 255)

UNIT = 1024


def plate(size: int, inset_ratio: float = 0.0, radius_ratio: float = 0.29) -> Image.Image:
    """Rounded-square gradient plate, transparent outside the corners."""
    inset = int(size * inset_ratio)
    box_size = size - inset * 2
    radius = int(box_size * radius_ratio)

    gradient = Image.new("RGBA", (box_size, box_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(gradient)
    for y in range(box_size):
        mix = y / max(1, box_size - 1)
        colour = tuple(
            int(PLATE_TOP[i] + (PLATE_BOTTOM[i] - PLATE_TOP[i]) * mix) for i in range(3)
        )
        draw.line([(0, y), (box_size, y)], fill=colour + (255,))

    mask = Image.new("L", (box_size, box_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle([(0, 0), (box_size - 1, box_size - 1)], radius, fill=255)

    tile = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    tile.paste(gradient, (inset, inset), mask)

    # A hairline of light along the top edge, so the plate has a little depth.
    ring = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(ring).rounded_rectangle(
        [(inset + 2, inset + 2), (size - inset - 3, size - inset - 3)],
        radius,
        outline=PLATE_RIM + (26,),
        width=3,
    )
    return Image.alpha_composite(tile, ring)


def mark(size: int, fill: int, invert_dot: bool = False) -> Image.Image:
    """The wifi fan, the slash and the A, drawn into a square canvas."""
    layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    unit = size / 1024
    cx = size / 2
    base = 0.60 * size

    wave = WHITE if not invert_dot else INK

    # Three arcs, 200°-340°, so the fan opens upward with a flat bottom edge.
    for radius in (0.146, 0.234, 0.322):
        r = radius * size
        box = [cx - r, base - r, cx + r, base + r]
        draw.arc(box, start=200, end=340, fill=wave + (255,), width=max(2, int(fill * unit)))

    # The slash: round caps, cutting the fan from lower-left to upper-right.
    width = int(0.043 * size)
    draw.line(
        [(cx - 0.226 * size, base - 0.115 * size), (cx + 0.226 * size, base - 0.336 * size)],
        fill=SLASH + (255,),
        width=width + int(0.014 * size),
    )

    # The A doubles as the dot of the fan.
    font_size = int(0.203 * size)
    font = None
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ):
        if pathlib.Path(candidate).exists():
            font = ImageFont.truetype(candidate, font_size)
            break
    if font is None:  # pragma: no cover - depends on the machine
        font = ImageFont.load_default()

    glyph = "A"
    left, top, right, bottom = draw.textbbox((0, 0), glyph, font=font)
    draw.text(
        (cx - (right - left) / 2 - left, base + 0.10 * size - top),
        glyph,
        font=font,
        fill=wave + (255,),
    )
    return layer


def recolour_mark(image: Image.Image) -> Image.Image:
    """Repaint the supplied art for a dark plate.

    Dark ink on a dark plate is an invisible icon, so the near-black "A" becomes
    near-white and the two slashes stay violet (a touch brighter than the original
    so they still read at 48px). Only the colour changes; the alpha channel — and
    therefore every antialiased edge — is carried straight through.
    """
    out = Image.new("RGBA", image.size, (0, 0, 0, 0))
    source = image.load()
    target = out.load()
    for y in range(image.height):
        for x in range(image.width):
            r, g, b, a = source[x, y]
            if a == 0:
                continue
            # Violet pixels have far more blue than red; ink has almost none.
            violet = min(1.0, max(0.0, (b - r) / 120.0))
            colour = tuple(
                int(MARK_LIGHT[i] + (MARK_ACCENT[i] - MARK_LIGHT[i]) * violet) for i in range(3)
            )
            target[x, y] = colour + (a,)
    return out


def artwork(size: int, share: float) -> Image.Image:
    """The supplied logo, trimmed to its ink and scaled to `share` of the canvas."""
    if LOGO.exists():
        source = Image.open(LOGO).convert("RGBA")
        alpha = source.split()[3].point(lambda value: 255 if value > 40 else 0)
        box = alpha.getbbox()
        if box:
            source = source.crop(box)
        target = int(size * share)
        scale = target / max(source.size)
        scaled = source.resize(
            (max(1, int(source.width * scale)), max(1, int(source.height * scale))),
            Image.LANCZOS,
        )
        return recolour_mark(scaled)

    big = mark(size, fill=44)
    box = big.getbbox()
    cropped = big.crop(box) if box else big
    scale = (size * share) / max(cropped.size)
    return cropped.resize(
        (max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale))), Image.LANCZOS
    )


def silhouette(size: int, share: float) -> Image.Image:
    """One-colour copy of the artwork, for Android's themed icon."""
    if LOGO.exists():
        source = Image.open(LOGO).convert("RGBA")
        alpha = source.split()[3]
        box = alpha.point(lambda value: 255 if value > 40 else 0).getbbox()
        if box:
            alpha = alpha.crop(box)
        mask = alpha.point(lambda value: 255 if value > 40 else 0)
        shape = Image.new("RGBA", mask.size, (255, 255, 255, 0))
        shape.putalpha(mask)
        target = int(size * share)
        scale = target / max(shape.size)
        return shape.resize(
            (max(1, int(shape.width * scale)), max(1, int(shape.height * scale))), Image.LANCZOS
        )

    layer = mark(size, fill=44, monochrome=True)
    box = layer.getbbox()
    cropped = layer.crop(box) if box else layer
    scale = (size * share) / max(cropped.size)
    return cropped.resize(
        (max(1, int(cropped.width * scale)), max(1, int(cropped.height * scale))), Image.LANCZOS
    )


def render(size: int, *, with_plate: bool, bleed: bool = False, share: float = 0.60) -> Image.Image:
    canvas = Image.new("RGBA", (size, size), INK + (255,) if bleed else (0, 0, 0, 0))
    if with_plate:
        canvas = Image.alpha_composite(canvas, plate(size, inset_ratio=0.0 if bleed else 0.04))

    # Draw/trim big, then centre on the measured bbox — eyeballing the offset
    # leaves the mark sitting high.
    art = artwork(size, share)
    canvas.alpha_composite(art, ((size - art.width) // 2, (size - art.height) // 2))
    return canvas


def centred(layer: Image.Image, ratio: float) -> Image.Image:
    """Scale a mark layer to `ratio` of a 1024 canvas and centre it."""
    box = layer.getbbox()
    cropped = layer.crop(box)
    target = int(UNIT * ratio)
    scaled = cropped.resize((target, target), Image.LANCZOS)
    out = Image.new("RGBA", (UNIT, UNIT), (0, 0, 0, 0))
    out.alpha_composite(scaled, ((UNIT - target) // 2, (UNIT - target) // 2))
    return out


def main() -> None:
    icon = render(UNIT, with_plate=True, bleed=True).convert("RGB")
    icon.save(ASSETS / "icon.png")

    # The splash shows the mark alone, with no plate behind it.
    #
    # Android 12+ draws the splash icon inside a system mask; a plate with its own
    # rounded corners ends up double-cut by that mask and reads as a strange
    # polygon (the "hexagon" when the app opens). A transparent mark cannot be
    # double-masked into anything but itself.
    splash = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    mark_image = artwork(512, 0.94)
    splash.alpha_composite(
        mark_image, ((512 - mark_image.width) // 2, (512 - mark_image.height) // 2)
    )
    splash.save(ASSETS / "splash-icon.png")

    # Adaptive icons: Android applies its own mask, so the background is a
    # full-bleed gradient and the foreground holds only the mark.
    background = Image.new("RGBA", (UNIT, UNIT), (0, 0, 0, 255))
    background.alpha_composite(plate(UNIT, inset_ratio=0.0, radius_ratio=0.0))
    background.save(ASSETS / "android-icon-background.png")
    foreground = Image.new("RGBA", (UNIT, UNIT), (0, 0, 0, 0))
    art = artwork(UNIT, 0.52)
    foreground.alpha_composite(art, ((UNIT - art.width) // 2, (UNIT - art.height) // 2))
    foreground.save(ASSETS / "android-icon-foreground.png")

    mono = Image.new("RGBA", (UNIT, UNIT), (0, 0, 0, 0))
    flat = silhouette(UNIT, 0.52)
    mono.alpha_composite(flat, ((UNIT - flat.width) // 2, (UNIT - flat.height) // 2))
    mono.save(ASSETS / "android-icon-monochrome.png")

    render(64, with_plate=True, bleed=False).save(ASSETS / "favicon.png")

    # A preview strip for eyeballing at real sizes.
    preview = Image.new("RGBA", (620, 220), (18, 19, 24, 255))
    for index, size in enumerate((128, 96, 64, 48)):
        small = render(size, with_plate=True, bleed=True)
        preview.alpha_composite(small, (24 + index * 150, 46))
    preview.save(HERE.parent / "icon-preview.png")
    print("icons written to", ASSETS)


if __name__ == "__main__":
    main()
