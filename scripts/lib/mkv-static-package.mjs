import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { appendFile, cp, lstat, mkdir, readFile, readdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { loadQualifiedHeaderNativeCache } from "./mkv-header-native-cache.mjs";
import { privateMkvHeaderPackageLayout, assertExactMkvHeaderArtifact } from "../verify-mkv-hevc-header-reproduction.mjs";

const mib = 1048576;
const mime = { "within-direct.mjs": /^(?:text|application)\/javascript(?:;|$)/i, "within-direct.wasm": /^application\/wasm(?:;|$)/i,
  "LICENSE.ffmpeg-lgpl3": /^text\/plain(?:;|$)/i };

export async function stagePrivateMkvStaticPackage({ root, directory }) {
  assert.equal(path.dirname(directory), path.join(root, "work"));
  assert.match(path.basename(directory), /^mkv-static-delivery-[a-zA-Z0-9]{6}$/);
  assert.equal(await realpath(directory), directory);
  const { proof, assets } = await loadQualifiedHeaderNativeCache(root);
  const layout = privateMkvHeaderPackageLayout();
  const client = path.join(root, "dist", "client"), server = path.join(root, "dist", "server");
  await assert.rejects(lstat(path.join(client, "engines", "remux-qualification")), { code: "ENOENT" });
  // Match the deployed directory relationship without touching dist or public.
  const site = path.join(directory, "site");
  await mkdir(site);
  let snapshotBytes = 0, files = 0;
  for (const dir of [client, server]) {
    assert.equal(await realpath(dir), dir);
    for (const entry of await readdir(dir, { withFileTypes: true, recursive: true })) {
      assert.ok(entry.isDirectory() || entry.isFile(), "Do not copy linked or special package files");
      if (!entry.isFile()) continue;
      files++; snapshotBytes += (await lstat(path.join(entry.parentPath, entry.name))).size;
      assert.ok(files <= 700 && snapshotBytes <= 512 * mib);
    }
    await cp(dir, path.join(site, path.basename(dir)), { recursive: true, force: false, errorOnExist: true });
  }
  await mkdir(path.join(site, "client", "engines", "remux-qualification"));
  // Extensions of upstream license files need not be recognized by the asset
  // server. Only the copied private package gets the explicit text type.
  const headers = path.join(site, "client", "_headers");
  const headerInfo = await lstat(headers);
  assert.ok(headerInfo.isFile() && !headerInfo.isSymbolicLink() && headerInfo.size <= 16384);
  await appendFile(headers, `\n/${layout["LICENSE.ffmpeg-lgpl3"]}\n  Content-Type: text/plain; charset=utf-8\n`);
  for (const [name, relative] of Object.entries(layout)) {
    const bytes = assets.get("/engines/remux/" + name)?.body ?? await readFile(path.join(root, "fixtures", "qualification-tools", name));
    assertExactMkvHeaderArtifact(bytes, proof.build.artifacts[name], name);
    await writeFile(path.join(site, "client", relative), bytes, { flag: "wx" });
  }
  return { snapshot: { files, bytes: snapshotBytes }, layout,
    qualifiedBuild: { head: proof.head, runId: proof.runId }, artifacts: proof.build.artifacts };
}

async function verifyStaticAsset(baseURL, relative, expected, mime) {
  const response = await fetch(baseURL + "/" + relative, { redirect: "error", signal: AbortSignal.timeout(10000) });
  try {
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", mime);
    assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
    assert.equal(response.headers.get("cross-origin-embedder-policy"), "require-corp");
    assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.match(response.headers.get("content-security-policy") ?? "", /wasm-unsafe-eval/);
    const hash = createHash("sha256"); let bytes = 0, maxRead = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length; maxRead = Math.max(maxRead, chunk.length);
      assert.ok(bytes <= expected.bytes && maxRead <= 262144);
      hash.update(chunk);
    }
    assert.equal(bytes, expected.bytes); assert.equal(hash.digest("hex"), expected.sha256);
    return { relative, ...expected, maxRead, mime: response.headers.get("content-type"), securityHeadersVerified: true };
  } finally { await response.body?.cancel().catch(() => {}); }
}

export async function verifyPrivateMkvStaticAssets(baseURL, staged) {
  const local = new URL(baseURL);
  assert.equal(local.origin, baseURL);
  assert.equal(local.protocol, "http:"); assert.equal(local.hostname, "127.0.0.1");
  const passes = [];
  for (const [name, relative] of Object.entries(staged.layout)) {
    passes.push(await verifyStaticAsset(baseURL, relative, staged.artifacts[name], mime[name]));
  }
  return passes;
}

// Authenticate the app bundle as well as the worker. The worker hash alone
// stays unchanged when the page-side lifecycle or storage policy changes.
export async function readBuiltMkvConverterPage(root) {
  const client = path.join(root, "dist", "client");
  const manifest = path.join(client, ".vite", "manifest.json");
  const manifestStat = await lstat(manifest);
  assert.ok(manifestStat.isFile() && manifestStat.size <= 131072);
  const source = "app/converter/ConverterApp.tsx";
  const entry = JSON.parse(await readFile(manifest, "utf8"))[source];
  assert.equal(entry.src, source);
  assert.match(entry.file, /^assets\/ConverterApp-[\w-]+\.js$/);
  const asset = path.join(client, entry.file), stat = await lstat(asset);
  assert.ok(stat.isFile() && stat.size > 0 && stat.size <= mib);
  const bytes = await readFile(asset);
  assert.equal(bytes.byteLength, stat.size);
  return { relative: entry.file, bytes: stat.size, sha256: createHash("sha256").update(bytes).digest("hex") };
}

export async function verifyServedMkvConverterPage(root, baseURL) {
  const local = new URL(baseURL);
  assert.equal(local.origin, baseURL);
  assert.equal(local.protocol, "http:"); assert.equal(local.hostname, "127.0.0.1"); assert.ok(local.port);
  const { relative, ...binding } = await readBuiltMkvConverterPage(root);
  return verifyStaticAsset(baseURL, relative, binding, mime["within-direct.mjs"]);
}
