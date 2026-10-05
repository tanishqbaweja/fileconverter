// Source-only audit. No conversion, fixtures, scratch or native media writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sources = [
  ["matroskadec.c", "45261fc3f0bc3f3cce0395966eeadfdacc4779d97fb4b31d2ae490a2ce99e093",
    /matroska->ctx->duration = matroska->duration \* matroska->time_scale/],
  ["mov.c", "7ed52b0e5932026058a55483e72880eb592cdef048b0cec15e9ea7e922ad0347",
    /c->fc->duration = AV_NOPTS_VALUE; \/\/ the duration from mvhd is not representing the whole file when fragments are used\./],
  ["demux.c", "463c59c8a2ef0382507a7880a17e73badd498a3e2e546ee6d8d7abe3bb4a1b0c",
    /duration = FFMAX\(duration, end_time - start_time\)/],
];
const nativeValidatorPins = [
  "331596532337bd5312c40f66f60a7fd10310b40907f2ed23295d7c0a73463dad",
  "cc303eaed1b0bdbd44260c3897aad64b43f0af5e4ae2d5ffa774978b518e19bd",
  "204a43fc0ea584e521b329d2ee8720c8015e557f97f7565084edb29f4088ef95",
];
// The independent native validator is not the Wasm muxer version. Verify its
// actual reported revision too, instead of assuming both are FFmpeg 8.1.2.
for (const revision of ["n8.1.2", "7e3781e3ca"]) {
for (let i = 0; i < sources.length; i++) {
  const [name, engineSha, pattern] = sources[i];
  const sha = revision === "n8.1.2" ? engineSha : nativeValidatorPins[i];
  const response = await fetch(`https://raw.githubusercontent.com/FFmpeg/FFmpeg/${revision}/libavformat/${name}`,
    { signal: AbortSignal.timeout(30000) });
  assert.ok(response.ok);
  assert.ok(Number(response.headers.get("content-length") ?? 0) <= 512 * 1024);
  const bytes = new Uint8Array(await response.arrayBuffer());
  assert.ok(bytes.length <= 512 * 1024, "Pinned source artifact cap");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), sha);
  const source = new TextDecoder().decode(bytes);
  assert.match(source, pattern);
  if (name === "demux.c") assert.match(source, /ic->duration == AV_NOPTS_VALUE\) \{\s*ic->duration = duration;/);
  process.stdout.write(`${revision}/${name}: ${bytes.length} bytes, SHA256 ${sha}, pinned timing semantics verified.\n`);
}
}
