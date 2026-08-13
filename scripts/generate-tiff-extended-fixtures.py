"""Generate small TIFF layout fixtures that FFmpeg's TIFF encoder cannot emit."""

from pathlib import Path

import numpy as np
from PIL import Image
import tifffile


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "images"
FIXTURES.mkdir(parents=True, exist_ok=True)

height, width = 95, 127
y, x = np.mgrid[0:height, 0:width]
rgb8 = np.stack(
    ((x * 2 + y * 7) % 256, (x * 11 + y * 3) % 256, (x * 5 + y * 13) % 256),
    axis=-1,
).astype(np.uint8)
gray16 = ((x * 257 + y * 521) % 65536).astype(np.uint16)
rgb16 = np.stack(
    (
        (x * 521 + y * 193) % 65536,
        (x * 97 + y * 719) % 65536,
        (x * 389 + y * 307) % 65536,
    ),
    axis=-1,
).astype(np.uint16)
alpha16 = ((x * 257 + y * 257) % 65536).astype(np.uint16)
rgba16 = np.concatenate((rgb16, alpha16[..., None]), axis=-1)

tifffile.imwrite(
    FIXTURES / "test-pattern-tiled.tiff",
    rgb8,
    tile=(32, 32),
    photometric="rgb",
    compression=None,
    metadata=None,
)
Image.fromarray(rgb8).save(
    FIXTURES / "test-pattern-tiled-reference.png",
    format="PNG",
    compress_level=9,
)
tifffile.imwrite(
    FIXTURES / "test-pattern-gray16-deflate.tiff",
    gray16,
    photometric="minisblack",
    compression="deflate",
    metadata=None,
)
tifffile.imwrite(
    FIXTURES / "test-pattern-rgb16.tiff",
    rgb16,
    photometric="rgb",
    compression=None,
    metadata=None,
)
tifffile.imwrite(
    FIXTURES / "test-pattern-rgba16.tiff",
    rgba16,
    photometric="rgb",
    extrasamples="unassalpha",
    compression=None,
    metadata=None,
)

for orientation, transformed in (
    (2, np.fliplr(rgb8)),
    (3, np.flipud(np.fliplr(rgb8))),
    (4, np.flipud(rgb8)),
    (5, np.transpose(rgb8, (1, 0, 2))),
    (6, np.rot90(rgb8, k=3)),
    (7, np.flipud(np.fliplr(np.transpose(rgb8, (1, 0, 2))))),
    (8, np.rot90(rgb8, k=1)),
):
    tifffile.imwrite(
        FIXTURES / f"test-pattern-orientation{orientation}.tiff",
        rgb8,
        photometric="rgb",
        compression=None,
        metadata=None,
        extratags=[(274, "H", 1, orientation, False)],
    )
    Image.fromarray(transformed).save(
        FIXTURES / f"test-pattern-orientation{orientation}-reference.png",
        format="PNG",
        compress_level=9,
    )

Image.fromarray(rgb8).save(
    FIXTURES / "test-pattern-jpeg.tiff",
    format="TIFF",
    compression="jpeg",
    quality=90,
)
with Image.open(FIXTURES / "test-pattern-jpeg.tiff") as jpeg_tiff:
    jpeg_tiff.convert("RGB").save(
        FIXTURES / "test-pattern-jpeg-reference.png",
        format="PNG",
        compress_level=9,
    )

for name, tile in (
    ("test-pattern-planar.tiff", None),
    ("test-pattern-planar-tiled.tiff", (32, 32)),
):
    tifffile.imwrite(
        FIXTURES / name,
        np.moveaxis(rgb8, -1, 0),
        photometric="rgb",
        planarconfig="separate",
        compression=None,
        metadata=None,
        tile=tile,
    )
    Image.fromarray(rgb8).save(
        FIXTURES / name.replace(".tiff", "-reference.png"),
        format="PNG",
        compress_level=9,
    )
with tifffile.TiffWriter(FIXTURES / "test-pattern-multipage.tiff") as writer:
    writer.write(rgb8, photometric="rgb", compression=None, metadata=None)
    writer.write(np.flipud(rgb8), photometric="rgb", compression=None, metadata=None)
Image.fromarray(rgb8).save(
    FIXTURES / "test-pattern-multipage-first-page-reference.png",
    format="PNG",
    compress_level=9,
)
