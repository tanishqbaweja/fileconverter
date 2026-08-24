"""Generate a small deterministic APNG that exercises alpha and frame disposal."""

import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures" / "images" / "animated-transparent.apng"
WEBP_OUTPUT = ROOT / "fixtures" / "images" / "animated-transparent.webp"
WIDTH = 64
HEIGHT = 48
DURATIONS_MS = [100, 200, 300]


def frame(index: int) -> Image.Image:
    image = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    left = 3 + index * 18
    draw.rectangle((left, 4, left + 12, 18), fill=(255, 24 + index * 48, 16, 255))
    draw.rectangle((left, 22, left + 9, 31), fill=(16, 255, 32, 64))
    draw.rectangle((left + 2, 34, left + 13, 43), fill=(32, 64, 255, 192))
    return image


frames = [frame(index) for index in range(3)]
frames[0].save(
    OUTPUT,
    format="PNG",
    save_all=True,
    append_images=frames[1:],
    duration=DURATIONS_MS,
    loop=2,
    disposal=[0, 0, 0],
    blend=[0, 0, 0],
    compress_level=9,
)
frames[0].save(
    WEBP_OUTPUT,
    format="WEBP",
    save_all=True,
    append_images=frames[1:],
    duration=DURATIONS_MS,
    loop=2,
    lossless=True,
    method=4,
)

for output, format_name in [(OUTPUT, "apng"), (WEBP_OUTPUT, "webp")]:
    payload = output.read_bytes()
    manifest = {
        "generatedBy": "scripts/generate-transparent-animation-fixture.py",
        "format": format_name,
        "bytes": len(payload),
        "sha256": hashlib.sha256(payload).hexdigest(),
        "width": WIDTH,
        "height": HEIGHT,
        "frameCount": len(frames),
        "durationsMs": DURATIONS_MS,
        "sourceLoopField": 2,
        "expectedGifRepetitionsAfterFirstPlay": 1,
    }
    output.with_suffix(f"{output.suffix}.json").write_text(
        json.dumps(manifest, indent=2) + "\n",
        encoding="utf-8",
    )
