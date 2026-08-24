"""Write one independently decoded animation frame as raw RGBA to stdout."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from PIL import Image


def webp_animation_metadata(source: Path) -> tuple[list[int], int | None]:
    data = source.read_bytes()
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return [], None
    durations: list[int] = []
    loop: int | None = None
    offset = 12
    while offset + 8 <= len(data):
        chunk_type = data[offset : offset + 4]
        chunk_size = int.from_bytes(data[offset + 4 : offset + 8], "little")
        payload = offset + 8
        end = payload + chunk_size
        if end > len(data):
            raise ValueError("WebP chunk exceeds the source boundary")
        if chunk_type == b"ANIM" and chunk_size >= 6:
            loop = int.from_bytes(data[payload + 4 : payload + 6], "little")
        elif chunk_type == b"ANMF" and chunk_size >= 16:
            durations.append(int.from_bytes(data[payload + 12 : payload + 15], "little"))
        offset = end + (chunk_size & 1)
    return durations, loop


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("frame", type=int, nargs="?")
    parser.add_argument("--metadata", action="store_true")
    args = parser.parse_args()
    if args.metadata and args.frame is not None:
        raise ValueError("choose either one frame or --metadata")
    if not args.metadata and args.frame is None:
        raise ValueError("a frame index or --metadata is required")
    if args.frame is not None and args.frame < 0:
        raise ValueError("frame index must be non-negative")
    with Image.open(args.source) as image:
        if args.metadata:
            durations = []
            for frame_index in range(getattr(image, "n_frames", 1)):
                image.seek(frame_index)
                durations.append(int(image.info.get("duration", 0)))
            loop = image.info.get("loop", 0)
            if image.format == "WEBP" and any(duration <= 0 for duration in durations):
                webp_durations, webp_loop = webp_animation_metadata(args.source)
                if len(webp_durations) == len(durations):
                    durations = webp_durations
                if webp_loop is not None:
                    loop = webp_loop
            print(
                json.dumps(
                    {
                        "frameCount": getattr(image, "n_frames", 1),
                        "width": image.width,
                        "height": image.height,
                        "loop": loop,
                        "durationsMs": durations,
                    },
                    separators=(",", ":"),
                )
            )
            return
        if args.frame >= getattr(image, "n_frames", 1):
            raise ValueError("frame index is outside the decoded animation")
        image.seek(args.frame)
        rgba = image.convert("RGBA")
        sys.stdout.buffer.write(rgba.tobytes())


if __name__ == "__main__":
    main()
