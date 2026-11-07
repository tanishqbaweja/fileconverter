import assert from "node:assert/strict";
import { access, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";

const result = await build({ entryPoints: ["build/svg-qualification-assets.ts"], bundle: true,
  platform: "node", format: "esm", write: false });
const { enforceSvgBuildAssets } = await import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].contents).toString("base64"));
const output = "dist/client";

async function withAssetTree(fn) {
  const runtime = await createOwnedRuntimeScratch("svg-asset-unit-");
  try {
    const root = runtime.directory, generated = path.join(root, output, "engines/svg");
    const retained = path.join(root, "public/engines/svg");
    const unrelated = path.join(root, output, "engines/jxl/decoder.wasm");
    for (const dir of [generated, retained, path.dirname(unrelated)]) await mkdir(dir, { recursive: true });
    for (const dir of [generated, retained]) for (const name of ["build-manifest.json", "resvg.wasm"]) {
      await writeFile(path.join(dir, name), "fixture", { flag: "wx" });
    }
    await writeFile(unrelated, "untouched", { flag: "wx" });
    await fn(root, generated);
    assert.equal(await readFile(path.join(retained, "resvg.wasm"), "utf8"), "fixture");
    assert.equal(await readFile(unrelated, "utf8"), "untouched");
  } finally { await runtime.close(); }
}

test("release packaging removes only the exact generated SVG pair; opt-in keeps it", async () => {
  await withAssetTree(async (root, generated) => {
    await enforceSvgBuildAssets(root, output, true);
    await access(path.join(generated, "resvg.wasm"));
    await enforceSvgBuildAssets(root, output, false);
    await assert.rejects(access(generated), { code: "ENOENT" });
    await enforceSvgBuildAssets(root, output, false);
    await assert.rejects(enforceSvgBuildAssets(root, output, true), { code: "ENOENT" });
  });
});

test("unexpected output, extra files and symlinks are rejected before deleting assets", async () => {
  await withAssetTree(async (root, generated) => {
    await assert.rejects(enforceSvgBuildAssets(root, "public", false), /Unexpected public asset output/);
    await writeFile(path.join(generated, "unexpected.wasm"), "extra", { flag: "wx" });
    await assert.rejects(enforceSvgBuildAssets(root, output, false), /Unexpected SVG asset inventory/);
    await access(path.join(generated, "resvg.wasm"));
  });
  const runtime = await createOwnedRuntimeScratch("svg-asset-unit-");
  try {
    const root = runtime.directory, retained = path.join(root, "keep"), engines = path.join(root, output, "engines");
    await mkdir(retained); await mkdir(engines, { recursive: true });
    await writeFile(path.join(retained, "resvg.wasm"), "protected", { flag: "wx" });
    await symlink(retained, path.join(engines, "svg"), process.platform === "win32" ? "junction" : "dir");
    await assert.rejects(enforceSvgBuildAssets(root, output, false), /redirected SVG asset/);
    assert.equal(await readFile(path.join(retained, "resvg.wasm"), "utf8"), "protected");
  } finally { await runtime.close(); }
});

test("service worker refuses to consult any cache for SVG qualification assets and expires the previous shell", async () => {
  const handlers = new Map(), deleted = [], consulted = [];
  const code = await readFile("public/sw.js", "utf8");
  runInNewContext(code, {
    URL, Promise,
    self: { location: { origin: "https://converter.invalid" }, clients: { claim() {} },
      addEventListener(name, fn) { handlers.set(name, fn); } },
    caches: { keys: async () => ["within-shell-v35", "within-shell-v36", "unrelated"],
      async delete(key) { deleted.push(key); },
      async match(request) { consulted.push(request.url); return "cached static asset"; } },
  });
  let activation;
  handlers.get("activate")({ waitUntil(value) { activation = value; } });
  await activation;
  assert.deepEqual(deleted, ["within-shell-v35"]);
  for (const pathname of ["/engines/svg/resvg.wasm", "/engines%2fsvg/resvg.wasm", "/engines/SVG/build-manifest.json",
    "/other%2f..%2fengines%2fsvg/resvg.wasm"]) {
    handlers.get("fetch")({ request: { url: "https://converter.invalid" + pathname, method: "GET" },
      respondWith() { assert.fail("SVG qualification asset reached service-worker cache"); } });
  }
  assert.deepEqual(consulted, []);
  let response;
  handlers.get("fetch")({ request: { url: "https://converter.invalid/icon.svg", method: "GET" },
    respondWith(value) { response = value; } });
  assert.equal(await response, "cached static asset");
});
