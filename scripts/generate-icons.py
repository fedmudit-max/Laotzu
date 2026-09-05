#!/usr/bin/env python3
"""Generate web + Android launcher icons from assets/logo-source.png."""

from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "assets" / "logo-source.png"
ASSETS = ROOT / "assets"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

ANDROID_DENSITIES = {
    "mipmap-mdpi": (48, 108),
    "mipmap-hdpi": (72, 162),
    "mipmap-xhdpi": (96, 216),
    "mipmap-xxhdpi": (144, 324),
    "mipmap-xxxhdpi": (192, 432),
}


def resize_square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def fit_on_canvas(img: Image.Image, size: int, scale: float, background: str = "white") -> Image.Image:
    canvas = Image.new("RGB", (size, size), background)
    inner = max(1, int(round(size * scale)))
    scaled = img.resize((inner, inner), Image.Resampling.LANCZOS)
    offset = (size - inner) // 2
    canvas.paste(scaled, (offset, offset))
    return canvas


def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"Missing source image: {SRC}")

    img = Image.open(SRC).convert("RGB")

    resize_square(img, 512).save(ASSETS / "icon-512.png", optimize=True)
    resize_square(img, 192).save(ASSETS / "icon-192.png", optimize=True)
    fit_on_canvas(img, 512, 0.78).save(ASSETS / "icon-512-maskable.png", optimize=True)
    fit_on_canvas(img, 192, 0.78).save(ASSETS / "icon-192-maskable.png", optimize=True)

    for folder, (launcher, foreground) in ANDROID_DENSITIES.items():
        out_dir = ANDROID_RES / folder
        out_dir.mkdir(parents=True, exist_ok=True)
        launcher_img = fit_on_canvas(img, launcher, 0.88)
        foreground_img = fit_on_canvas(img, foreground, 0.72)
        launcher_img.save(out_dir / "ic_launcher.png", optimize=True)
        launcher_img.save(out_dir / "ic_launcher_round.png", optimize=True)
        foreground_img.save(out_dir / "ic_launcher_foreground.png", optimize=True)

    splash_path = ANDROID_RES / "drawable-nodpi" / "ic_splash_king.png"
    splash_path.parent.mkdir(parents=True, exist_ok=True)
    fit_on_canvas(img, 576, 0.72).save(splash_path, optimize=True)

    print(f"Generated icons from {SRC}")


if __name__ == "__main__":
    main()
