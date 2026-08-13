"""Stream a large, deterministic RGB TIFF as independent uncompressed tiles."""

from pathlib import Path
import subprocess
import sys

import numpy as np
import tifffile


ROOT = Path(__file__).resolve().parents[1]
ORIENTATION = int(sys.argv[1]) if len(sys.argv) > 1 else 1
if ORIENTATION not in (1, 6):
    raise ValueError("Stress TIFF orientation must be 1 or 6")
SUFFIX = "-orientation6" if ORIENTATION == 6 else ""
OUTPUT = ROOT / "fixtures" / "stress" / "images" / f"tiff-rgb-tiled-48m{SUFFIX}.tiff"
REFERENCE = ROOT / "fixtures" / "stress" / "images" / f"tiff-rgb-tiled-48m{SUFFIX}-reference.png"
HEIGHT = 2048
WIDTH = 8192
TILE_HEIGHT = 128
TILE_WIDTH = 128


def tiles():
    for y_start in range(0, HEIGHT, TILE_HEIGHT):
        for x_start in range(0, WIDTH, TILE_WIDTH):
            y, x = np.mgrid[
                y_start : y_start + TILE_HEIGHT,
                x_start : x_start + TILE_WIDTH,
            ]
            yield np.stack(
                (
                    (x * 2 + y * 7) % 256,
                    (x * 11 + y * 3) % 256,
                    (x * 5 + y * 13) % 256,
                ),
                axis=-1,
            ).astype(np.uint8)


def row_blocks():
    for y_start in range(0, HEIGHT, TILE_HEIGHT):
        y, x = np.mgrid[y_start : y_start + TILE_HEIGHT, 0:WIDTH]
        yield np.stack(
            (
                (x * 2 + y * 7) % 256,
                (x * 11 + y * 3) % 256,
                (x * 5 + y * 13) % 256,
            ),
            axis=-1,
        ).astype(np.uint8)


def transposed_row_blocks():
    source_y = np.arange(HEIGHT - 1, -1, -1, dtype=np.int64)
    for output_y in range(WIDTH):
        source_x = np.full(HEIGHT, output_y, dtype=np.int64)
        yield np.stack(
            (
                (source_x * 2 + source_y * 7) % 256,
                (source_x * 11 + source_y * 3) % 256,
                (source_x * 5 + source_y * 13) % 256,
            ),
            axis=-1,
        ).astype(np.uint8)[None, ...]


OUTPUT.parent.mkdir(parents=True, exist_ok=True)
tifffile.imwrite(
    OUTPUT,
    tiles(),
    shape=(HEIGHT, WIDTH, 3),
    dtype=np.uint8,
    tile=(TILE_HEIGHT, TILE_WIDTH),
    photometric="rgb",
    compression=None,
    metadata=None,
    extratags=[(274, "H", 1, ORIENTATION, False)],
)

reference_width = HEIGHT if ORIENTATION == 6 else WIDTH
reference_height = WIDTH if ORIENTATION == 6 else HEIGHT

encoder = subprocess.Popen(
    [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgb24",
        "-video_size",
        f"{reference_width}x{reference_height}",
        "-i",
        "pipe:0",
        "-frames:v",
        "1",
        "-c:v",
        "png",
        "-compression_level",
        "9",
        str(REFERENCE),
    ],
    stdin=subprocess.PIPE,
)
assert encoder.stdin is not None
for block in transposed_row_blocks() if ORIENTATION == 6 else row_blocks():
    encoder.stdin.write(block.tobytes())
encoder.stdin.close()
if encoder.wait() != 0:
    raise RuntimeError("FFmpeg failed to encode the streamed TIFF stress reference")
