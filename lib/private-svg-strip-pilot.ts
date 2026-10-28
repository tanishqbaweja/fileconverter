// Private experiment only: caller must prove a 1:1 zero-origin SVG viewBox.
// A fixed overlap is a diagnostic hypothesis, NOT general SVG filter support.
import type { Resvg } from "./vendor/resvg-binding.mjs";
import { PNG_STRIP_BYTES, pngStripObservation, writeRgbaPngStrips } from "../workers/rgba-png-stream";
export const SVG_PILOT_ROWS = 64;
export const SVG_PILOT_HALO = 48;
export function svgStripPilotObservation() {
  return { centralRows: SVG_PILOT_ROWS, haloRows: SVG_PILOT_HALO, renderedViewports: 0,
    releasedViewports: 0, completedRows: 0, maximumViewportPixels: 0,
    maximumRgbaCopyBytes: 0, maximumExplicitPixelWorkingBytes: 0,
    png: pngStripObservation(), generalFilterSupportClaimed: false };
}

// This matches tiny-skia0.10's f64 demultiplication, not an approximate multiply.
// Zero-alpha Rust float-to-u8 saturation yields zero; opaque bytes are unchanged.
export function demultiplySvgRgba(bytes: Uint8Array<ArrayBuffer>): void {
  if (bytes.length % 4) throw new RangeError("Complete RGBA pixels required.");
  for (let offset = 0; offset < bytes.length; offset += 4) {
    const alpha = bytes[offset + 3];
    if (alpha === 255) continue;
    if (alpha === 0) { bytes.fill(0, offset, offset + 3); continue; }
    const ratio = alpha / 255;
    for (let channel = 0; channel < 3; channel++)
      bytes[offset + channel] = Math.min(255, Math.floor(bytes[offset + channel] / ratio + 0.5));
  }
}

type Renderer = Pick<InstanceType<typeof Resvg>, "getBBox" | "cropByBBox" | "render">;
interface Options {
  renderer: Renderer;
  width: number;
  height: number;
  observation: ReturnType<typeof svgStripPilotObservation>;
  assertActive: () => void;
  write: (bytes: Uint8Array<ArrayBuffer>) => Promise<void>;
  onRows: (rows: number) => void;
  onRasterized: () => void;
}

export async function runPrivateSvgStripPilot(options: Options): Promise<void> {
  const {renderer, width, height, observation, assertActive, write, onRows, onRasterized} = options;
  if (![width,height].every(value => Number.isSafeInteger(value) && value > 0 && value <= 8192)
      || width * height > 8388608) throw new RangeError("Private SVG strip dimensions exceeded.");
  const box = renderer.getBBox();
  if (!box) throw new Error("Private viewport experiment requires a native bounding box.");
  let primaryFailure = false;
  const rowBytes = width * 4, rowsPerChunk = Math.floor(PNG_STRIP_BYTES / (rowBytes + 1));
  async function* strips(): AsyncGenerator<Uint8Array<ArrayBuffer>> {
    for (let y = 0; y < height; y += SVG_PILOT_ROWS) {
      assertActive();
      const rows = Math.min(SVG_PILOT_ROWS, height - y), top = Math.max(0, y - SVG_PILOT_HALO);
      const bottom = Math.min(height, y + rows + SVG_PILOT_HALO), viewportHeight = bottom - top;
      box!.x = 0; box!.y = top; box!.width = width; box!.height = viewportHeight;
      renderer.cropByBBox(box!);
      let image: ReturnType<Renderer["render"]> | null = null, nativeFailure = false;
      let rgba: Uint8Array;
      try {
        image = renderer.render(); observation.renderedViewports++;
        assertActive();
        if (image.width !== width || image.height !== viewportHeight) throw new Error("Unexpected private viewport raster dimensions.");
        rgba = image.pixels;
        if (rgba.length !== width * viewportHeight * 4) throw new Error("Unexpected viewport pixel byte count.");
      } catch (error) { nativeFailure = true; throw error; }
      finally {
        try { if (image) { image.free(); observation.releasedViewports++; } }
        catch (error) { if (!nativeFailure) throw error; }
      }
      observation.maximumViewportPixels = Math.max(observation.maximumViewportPixels, width * viewportHeight);
      observation.maximumRgbaCopyBytes = Math.max(observation.maximumRgbaCopyBytes, rgba!.length);
      for (let row = 0; row < rows; row += rowsPerChunk) {
        assertActive();
        const count = Math.min(rowsPerChunk, rows - row), start = (y - top + row) * rowBytes;
        const central = rgba!.slice(start, start + count * rowBytes);
        demultiplySvgRgba(central);
        observation.maximumExplicitPixelWorkingBytes = Math.max(observation.maximumExplicitPixelWorkingBytes,
          rgba!.length + central.length + count * (rowBytes + 1));
        yield central;
        observation.completedRows += count; onRows(observation.completedRows);
      }
    }
    onRasterized();
  }
  try { await writeRgbaPngStrips({width,height,strips: strips(),observation: observation.png,assertActive,write}); }
  catch (error) { primaryFailure = true; throw error; }
  finally { try { box.free(); } catch (error) { if (!primaryFailure) throw error; } }
}
