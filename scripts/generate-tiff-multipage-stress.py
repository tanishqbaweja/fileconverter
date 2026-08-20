"""Create a large two-page TIFF from the bounded tiled stress fixture."""

from pathlib import Path
import shutil

import numpy as np
from PIL import Image
import tifffile


ROOT = Path(__file__).resolve().parents[1]
FIXTURES = ROOT / "fixtures" / "stress" / "images"
SOURCE = FIXTURES / "tiff-rgb-tiled-48m.tiff"
OUTPUT = FIXTURES / "tiff-rgb-tiled-multipage-48m.tiff"
SECOND_REFERENCE = FIXTURES / "tiff-rgb-tiled-multipage-second-reference.png"

if not SOURCE.is_file():
    raise FileNotFoundError(f"Generate the base TIFF stress fixture first: {SOURCE}")

shutil.copyfile(SOURCE, OUTPUT)
y, x = np.mgrid[0:95, 0:127]
second_page = np.stack(
    (
        (x * 17 + y * 3) % 256,
        (x * 5 + y * 19) % 256,
        (x * 11 + y * 7) % 256,
    ),
    axis=-1,
).astype(np.uint8)
with tifffile.TiffWriter(OUTPUT, append=True) as writer:
    writer.write(
        second_page,
        photometric="rgb",
        compression="deflate",
        metadata=None,
    )
Image.fromarray(second_page).save(
    SECOND_REFERENCE,
    format="PNG",
    compress_level=9,
)
