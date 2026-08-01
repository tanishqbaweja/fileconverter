import hashlib
import json
from pathlib import Path

from PIL import Image, ImageDraw

PROJECT_ROOT = Path(__file__).resolve().parent.parent
FIXTURE_ROOT = PROJECT_ROOT / "fixtures" / "stress" / "images"
SVG_PATH = FIXTURE_ROOT / "svg-grid-8m.svg"
REFERENCE_PATH = FIXTURE_ROOT / "svg-grid-8m-reference.png"
WIDTH = 3840
HEIGHT = 2160
TILE = 40

FIXTURE_ROOT.mkdir(parents=True, exist_ok=True)
image = Image.new("RGB", (WIDTH, HEIGHT))
draw = ImageDraw.Draw(image)
elements = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" viewBox="0 0 {WIDTH} {HEIGHT}">',
]
for row, y in enumerate(range(0, HEIGHT, TILE)):
    for column, x in enumerate(range(0, WIDTH, TILE)):
        red = (column * 17 + row * 3) % 256
        green = (column * 5 + row * 19) % 256
        blue = (column * 11 + row * 7) % 256
        color = f"#{red:02x}{green:02x}{blue:02x}"
        elements.append(
            f'<rect x="{x}" y="{y}" width="{TILE}" height="{TILE}" fill="{color}"/>'
        )
        draw.rectangle((x, y, x + TILE - 1, y + TILE - 1), fill=(red, green, blue))
elements.append("</svg>")
SVG_PATH.write_text("\n".join(elements) + "\n", encoding="utf-8", newline="\n")
image.save(REFERENCE_PATH, format="PNG", compress_level=6)

source = SVG_PATH.read_bytes()
reference = REFERENCE_PATH.read_bytes()
manifest = {
    "generatedBy": "scripts/generate-svg-stress-fixture.py",
    "bytes": len(source),
    "sha256": hashlib.sha256(source).hexdigest(),
    "width": WIDTH,
    "height": HEIGHT,
    "elements": len(elements) - 2,
    "validationReference": REFERENCE_PATH.relative_to(PROJECT_ROOT).as_posix(),
    "validationBytes": len(reference),
    "validationSha256": hashlib.sha256(reference).hexdigest(),
    "probe": {"streams": [{"width": WIDTH, "height": HEIGHT, "nb_frames": "1"}]},
}
Path(f"{SVG_PATH}.json").write_text(
    json.dumps(manifest, indent=2) + "\n", encoding="utf-8", newline="\n"
)
print(json.dumps(manifest))
