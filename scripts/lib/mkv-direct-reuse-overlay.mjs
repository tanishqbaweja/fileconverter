import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, version } from "esbuild";

const worker = "workers/conversion.worker.ts", media = "workers/media-remux.ts", writer = "workers/random-access-destination.ts";
const pins = Object.freeze({
  [worker]: "893908859d5098d7e2078d2ae8e4231e1b6b7ba199dac9126d8cf8a5c761dbe5",
  [media]: "1b1afb350aafaa1bbc13f0f5150bdedeb85a94c1510318fa8713b4b7f5edbf59",
  [writer]: "f46a4db401daabeb40a0b9eaa9feb256b623c21d2a7f41af549b6797842b4375",
});
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function exact(source, before, after) {
  assert.equal(source.split(before).length, 2, before);
  const out = source.replace(before, () => after);
  assert.equal(out.split(after).length, 2, after);
  assert.equal(out.replace(after, () => before), source);
  return out;
}

export function prepareMkvDirectReuseOverlay(sources, mode, writerUrl) {
  assert.ok(["fresh", "reuse"].includes(mode));
  assert.match(writerUrl, /^\/assets\/direct-file-writer\.worker-[\w-]+\.js$/);
  for (const file of Object.keys(pins)) assert.equal(sha(sources[file]), pins[file], file);
  const files = Object.fromEntries(Object.entries(sources).map(([file, bytes]) => [file, bytes.toString("utf8")]));
  files[writer] = exact(files[writer], 'new URL("./direct-file-writer.worker.ts", import.meta.url)', JSON.stringify(writerUrl));
  const staged = '    if (message.destination.mode === "staged-handle") {\n      destination = await openStagedDirectDestination(';
  files[worker] = exact(files[worker], staged, `    if (profileId === "mkv-to-mp4" && message.destination.mode === "staged-handle") {
      destination = await openDestination({ mode: "handle", handle: message.destination.handle }, false,
        message.testFault, DIRECT_REMUX_WRITE_CHUNK, true);
    } else ${staged.trimStart()}`);
  const fault = "  const wrapper: RandomAccessDestination = {\n    requiresOwnedWriteBuffer: writable.requiresOwnedWriteBuffer,";
  files[worker] = exact(files[worker], fault, `${fault}\n    maximumWriteBytes: writable.maximumWriteBytes,`);
  const originalMedia = files[media];
  const edits = [
    ['import type { RandomAccessDestination } from "./random-access-destination";',
      'import type { RandomAccessDestination } from "./random-access-destination";\nimport { createMkvWriteReuse, MKV_REUSE_WRITE_BYTES } from "../scripts/lib/private-mkv-write-reuse";'],
    ["  const bridge: RemuxBridge = {\n    inputSize: file.size,\n    copyOutput: writable.requiresOwnedWriteBuffer,", `  const directReuse = profileId === "mkv-to-mp4" && useDirectRemuxCore && !writable.writeSync &&
    writable.requiresOwnedWriteBuffer && maximumOutputWriteBytes === MKV_REUSE_WRITE_BYTES
    ? createMkvWriteReuse(operation => writable.write(operation)) : undefined;
  const bridge: RemuxBridge = {
    inputSize: file.size,
    copyOutput: writable.requiresOwnedWriteBuffer && !directReuse,`],
    ["        await writable.write({\n          type: \"write\",\n          position: offset,\n          data: source,\n        });",
      "        if (directReuse) await directReuse(offset, source);\n        else await writable.write({\n          type: \"write\",\n          position: offset,\n          data: source,\n        });"],
  ];
  let reuse = originalMedia;
  for (const [before, after] of edits) reuse = exact(reuse, before, after);
  let reversed = reuse;
  for (const [before, after] of edits.toReversed()) reversed = exact(reversed, after, before);
  assert.equal(reversed, originalMedia, "Direct arms must change only the async output allocation");
  if (mode === "reuse") files[media] = reuse;
  return { files, proof: { originalWorkerSha256: pins[worker], originalMediaSha256: pins[media],
    commonPrivateWorkerSha256: sha(files[worker]), commonPrivateWriterSha256: sha(files[writer]),
    mediaArmSha256: sha(files[media]), exactSingleFactorVerified: true, currentPublicRouteCompared: false } };
}

export async function buildMkvDirectReuseOverlay({ root, directory, mode }) {
  assert.equal(version, "0.28.1");
  assert.equal(path.dirname(directory), path.join(root, "work"));
  assert.match(path.basename(directory), /^mkv-direct-reuse-[a-zA-Z0-9]{6}$/);
  const assets = path.join(root, "dist/client/assets"), names = await readdir(assets);
  const workerNames = names.filter(name => /^conversion\.worker-[\w-]+\.js$/.test(name));
  const writers = names.filter(name => /^direct-file-writer\.worker-[\w-]+\.js$/.test(name));
  assert.equal(workerNames.length, 1); assert.equal(writers.length, 1);
  const inputs = Object.fromEntries(await Promise.all(Object.keys(pins).map(async file => [file, await readFile(path.join(root, file))])));
  const { files, proof } = prepareMkvDirectReuseOverlay(inputs, mode, "/assets/" + writers[0]);
  const hits = new Set();
  const result = await build({ absWorkingDir: root, entryPoints: [worker], bundle: true, platform: "browser", format: "esm",
    target: "es2022", minify: true, write: false, plugins: [{ name: "private-mkv-direct-reuse", setup(api) {
      api.onLoad({ filter: /[\\/](?:conversion\.worker|media-remux|random-access-destination)\.ts$/ }, args => {
        const relative = path.relative(root, args.path).replaceAll("\\", "/");
        assert.ok(Object.hasOwn(files, relative)); hits.add(relative);
        return { contents: files[relative], loader: "ts", resolveDir: path.dirname(args.path) };
      });
    } }] });
  assert.deepEqual([...hits].sort(), Object.keys(pins).sort());
  assert.equal(result.outputFiles.length, 1);
  const output = result.outputFiles[0].contents;
  assert.ok(output.length <= 1048576);
  const file = path.join(directory, `private-mkv-${mode}.mjs`);
  await writeFile(file, output, { flag: "wx" });
  return { file, requestedAsset: "/assets/" + workerNames[0], mode, proof: { ...proof,
    overlayBytes: output.length, overlaySha256: sha(output),
    releaseWorkerSha256: sha(await readFile(path.join(assets, workerNames[0]))) } };
}
