#!/usr/bin/env python3
"""Decode-check Android launcher artwork and the Google Play listing icon."""
from pathlib import Path
import sys
import xml.etree.ElementTree as ET

try:
    from PIL import Image
except ImportError as exc:
    print("ERROR: Pillow is required for image decode validation.", file=sys.stderr)
    raise SystemExit(2) from exc

ROOT = Path(__file__).resolve().parents[1]
ANDROID_NS = "{http://schemas.android.com/apk/res/android}"
PLAY_ICON = Path("public/android-icons/playstore-icon-512.png")
ASSETS = [
    Path("android/app/src/main/res/drawable-nodpi/ic_app_logo.png"),
    Path("android/app/src/main/res/drawable-nodpi/ic_launcher_foreground.png"),
    Path("public/android-icons/adaptive-foreground.png"),
    Path("public/android-icons/ic_launcher-mdpi.png"),
    Path("public/android-icons/ic_launcher-hdpi.png"),
    Path("public/android-icons/ic_launcher-xhdpi.png"),
]
for density in ("mdpi", "hdpi", "xhdpi"):
    ASSETS.extend([
        Path(f"android/app/src/main/res/mipmap-{density}/ic_launcher.png"),
        Path(f"android/app/src/main/res/mipmap-{density}/ic_launcher_round.png"),
    ])

def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)

def validate_png(relative_path: Path) -> tuple[int, int]:
    path = ROOT / relative_path
    if not path.is_file() or path.stat().st_size == 0:
        fail(f"Missing or empty icon asset: {relative_path}")
    try:
        with Image.open(path) as image:
            if image.format != "PNG":
                fail(f"Expected PNG format: {relative_path}; found {image.format}")
            dimensions = image.size
            image.verify()
        with Image.open(path) as image:
            image.load()
            if image.size != dimensions:
                fail(f"Inconsistent image dimensions after decode: {relative_path}")
            if image.width != image.height:
                fail(f"Icon image must be square: {relative_path} ({image.width}x{image.height})")
    except Exception as exc:
        fail(f"Image decode failed for {relative_path}: {exc}")
    print(f"PASS image {relative_path}: {dimensions[0]}x{dimensions[1]} PNG decoded")
    return dimensions

for asset in ASSETS:
    validate_png(asset)
play_width, play_height = validate_png(PLAY_ICON)
if (play_width, play_height) != (512, 512):
    fail(f"Play Store listing icon must be 512x512; found {play_width}x{play_height}")

manifest = ET.parse(ROOT / "android/app/src/main/AndroidManifest.xml").getroot()
application = manifest.find("application")
if application is None:
    fail("Manifest has no application element")
if application.attrib.get(ANDROID_NS + "label") != "@string/app_name":
    fail("Launcher label must reference @string/app_name")
if application.attrib.get(ANDROID_NS + "icon") != "@mipmap/ic_launcher":
    fail("Manifest launcher icon must reference @mipmap/ic_launcher")
if application.attrib.get(ANDROID_NS + "roundIcon") != "@mipmap/ic_launcher_round":
    fail("Manifest round icon must reference @mipmap/ic_launcher_round")
if application.attrib.get(ANDROID_NS + "supportsRtl") != "true":
    fail("RTL support must remain enabled")
for adaptive_path in (
    ROOT / "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml",
    ROOT / "android/app/src/main/res/mipmap-anydpi-v26/ic_launcher_round.xml",
):
    try:
        root = ET.parse(adaptive_path).getroot()
    except Exception as exc:
        fail(f"Invalid adaptive icon XML {adaptive_path}: {exc}")
    if not root.tag.endswith("adaptive-icon"):
        fail(f"Unexpected adaptive icon root in {adaptive_path}: {root.tag}")
    refs = {child.attrib.get(ANDROID_NS + "drawable") for child in list(root)}
    if not refs or any(not ref for ref in refs):
        fail(f"Adaptive icon has a missing drawable reference: {adaptive_path}")
    print(f"PASS adaptive icon XML: {adaptive_path.relative_to(ROOT)}")
print("PASS manifest app name/icon references and RTL support")
