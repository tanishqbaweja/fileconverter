"""Stream a large, deterministic RGB TIFF as independent uncompressed tiles."""

from pathlib import Path
import subprocess

import numpy as np
import tifffile


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "fixtures" / "stress" / "images" / "tiff-rgb-tiled-48m.tiff"
REFERENCE = ROOT / "fixtures" / "stress" / "images" / "tiff-rgb-tiled-48m-reference.png"
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
)

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
        f"{WIDTH}x{HEIGHT}",
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
for block in row_blocks():
    encoder.stdin.write(block.tobytes())
encoder.stdin.close()
if encoder.wait() != 0:
    raise RuntimeError("FFmpeg failed to encode the streamed TIFF stress reference")
