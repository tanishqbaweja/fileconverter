"""Create a deterministic animated WebP from the committed GIF fixture."""

from pathlib import Path

from PIL import Image, ImageSequence


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "images"
SOURCE = FIXTURES / "animated-pattern.gif"
OUTPUT = FIXTURES / "animated-pattern.webp"
REFERENCE = FIXTURES / "animated-pattern-first-frame-reference.png"

with Image.open(SOURCE) as image:
    frames = [frame.convert("RGBA") for frame in ImageSequence.Iterator(image)]
    durations = [int(frame.info.get("duration", 250)) for frame in ImageSequence.Iterator(image)]

if len(frames) < 2:
    raise RuntimeError("The animated WebP source must contain multiple frames.")

frames[0].save(REFERENCE, format="PNG", compress_level=9)
frames[0].save(
    OUTPUT,
    format="WEBP",
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    lossless=True,
    method=4,
)
