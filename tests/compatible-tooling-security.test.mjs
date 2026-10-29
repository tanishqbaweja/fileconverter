import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const atLeast = (actual, minimum) => {
  assert.match(actual, /^\d+\.\d+\.\d+$/);
  const left = actual.split(".").map(Number), right = minimum.split(".").map(Number);
  for (let i = 0; i < 3; i++) { if (left[i] !== right[i]) return left[i] > right[i]; }
  return true;
};
test("installed tooling and exact lock pins meet the reviewed patch floors without changing public conversion policy", async () => {
  const lock = await json("package-lock.json"), pkg = await json("package.json");
  const floors = { "@babel/core": "7.29.7", "baseline-browser-mapping": "2.11.0", "brace-expansion": "1.1.21",
    "@typescript-eslint/typescript-estree/node_modules/brace-expansion": "5.0.12", browserslist: "4.28.7",
    "fast-uri": "3.1.9", fflate: "0.7.5", "js-yaml": "4.3.2", "source-map-js": "1.2.2", zod: "4.6.6", vite: "8.3.5" };
  for (const [name, floor] of Object.entries(floors)) {
    const key = `node_modules/${name}`, installed = await json(`${key}/package.json`);
    assert.equal(installed.version, lock.packages[key].version, `Installed ${name} matches lock`);
    assert.ok(atLeast(installed.version, floor), `${name} meets ${floor}`);
  }
  assert.equal(pkg.devDependencies.vite, lock.packages["node_modules/vite"].version);
  assert.match(pkg.devDependencies.vite, /^8\.\d+\.\d+$/); // Existing framework's supported major, no unreviewed major migration.
  assert.deepEqual(pkg.overrides, { "miniflare@5.20261019.2-beta": { undici: "7.30.1" }, "vinext@0.0.50": { "image-size": "2.0.3", "@vercel/og":"1.0.3" }, "satori@0.33.5":{fflate:"0.7.5"} },
    "Only the reviewed exact consumer-scoped security pins may override upstream dependencies");
  assert.equal(pkg.scripts["db:generate"], undefined);
});
test("retained same-source audit comparison removes precisely the ten targeted groups and keeps nine unresolved groups visible", async () => {
  const before = await json("evidence/2026-10-26-database-scaffold-audit-final.json");
  const after = await json("evidence/2026-10-26-compatible-tooling-audit.json");
  assert.equal(before.audit.metadata.vulnerabilities.total, 19);
  assert.deepEqual(after.audit.metadata.vulnerabilities, { info: 0, low: 1, moderate: 0, high: 8, critical: 0, total: 9 });
  assert.deepEqual(Object.keys(before.audit.vulnerabilities).filter(name => !after.audit.vulnerabilities[name]).sort(),
    ["@babel/core", "baseline-browser-mapping", "brace-expansion", "browserslist", "fast-uri", "fflate", "js-yaml", "source-map-js", "vite", "zod"].sort());
  assert.deepEqual(Object.keys(after.audit.vulnerabilities).sort(),
    ["@cloudflare/vite-plugin", "esbuild", "image-size", "miniflare", "sharp", "undici", "vinext", "wrangler", "ws"].sort());
  assert.equal(after.auditExitCode, 1); assert.equal(after.cleanup.ownedScratchRemoved, true);
  const expected = structuredClone(before.graphRoot); expected.devDependencies.vite = "8.3.5";
  assert.deepEqual(after.graphRoot, expected, "Only Vite's exact root pin changes; framework/Cloudflare peers stay unchanged");
});
test("retained graph changes stay within the reviewed target families and Vite compiler/platform dependencies", async () => {
  const before = (await json("evidence/2026-10-26-database-scaffold-audit-final.json")).packageEntries;
  const after = (await json("evidence/2026-10-26-compatible-tooling-audit.json")).packageEntries;
  assert.equal(Object.keys(before).length, 687); assert.equal(Object.keys(after).length, 687);
  assert.deepEqual(Object.keys(before).filter(key => !after[key]), ["node_modules/@rolldown/binding-wasm32-wasi",
    "node_modules/@rolldown/binding-wasm32-wasi/node_modules/@napi-rs/wasm-runtime"]);
  assert.deepEqual(Object.keys(after).filter(key => !before[key]), ["node_modules/@rolldown/binding-android-arm-eabi", "node_modules/vite/node_modules/postcss"]);
  const permitted = /^node_modules\/(?:@babel\/[^/]+|@oxc-project\/types|@rolldown\/[^/]+|@typescript-eslint\/typescript-estree\/node_modules\/brace-expansion|baseline-browser-mapping|brace-expansion|browserslist|caniuse-lite|electron-to-chromium|fast-uri|fflate|js-yaml|node-releases|rolldown|source-map-js|tinyglobby|update-browserslist-db|vite(?:\/node_modules\/(?:lightningcss(?:-[^/]+)?|picomatch|postcss))?|zod)$/;
  const changed = Object.keys(after).filter(key => before[key] !== after[key]);
  assert.ok(changed.length > 10);
  for (const key of changed) assert.match(key, permitted, `Reviewed dependency family: ${key}`);
});
test("actual ESLint YAML consumer parses ordinary configuration and bounds the patched empty-merge case", () => {
  const requireFromConsumer = createRequire(path.resolve("node_modules/@eslint/eslintrc/package.json"));
  const yaml = requireFromConsumer("js-yaml");
  assert.deepEqual(yaml.load("name: converter\nitems: [one, two]\n"), { name: "converter", items: ["one", "two"] });
  const aliases = "arr: &arr [" + "{},".repeat(20) + "]\ntargets:\n" + "  - <<: *arr\n".repeat(20);
  assert.throws(() => yaml.load(aliases, { schema: yaml.YAML11_SCHEMA, maxTotalMergeKeys: 100 }), /merge|limit|budget/i);
});
test("actual framework-font fflate consumer still roundtrips bounded archive data; it is not the application's conversion engine", () => {
  const requireFromConsumer = createRequire(path.resolve("node_modules/@shuding/opentype.js/package.json"));
  const { zipSync, unzipSync } = requireFromConsumer("fflate"), input = Uint8Array.of(1, 2, 3);
  const packed = zipSync({ "bounded.txt": input }); assert.ok(packed.length < 1024);
  assert.deepEqual(unzipSync(packed)["bounded.txt"], input);
  assert.throws(() => unzipSync(Uint8Array.of(0, 1, 2)));
});
test("owned browser wrapper keeps the complete original specs, headless operation, birth-checked cleanup and protected original", async () => {
  const source = await readFile("scripts/run-owned-privacy-offline.mjs", "utf8");
  assert.match(source, /\*\*\/privacy-offline.spec.ts/); assert.match(source, /\*\*\/static-host-policy.spec.ts/);
  assert.doesNotMatch(source, /--grep|--headed|headless: false|\.replace\(/);
  assert.match(source, /result.stats.expected, 19/); assert.match(source, /result.stats.skipped, 0/);
  assert.match(source, /headless:true/); assert.match(source, /windowsHide: true/);
  assert.match(source, /maxFailures:1/);
  assert.ok(source.indexOf("report.methodPreflight = []") < source.indexOf('runner = spawn('));
  assert.ok(source.indexOf("report.assetPreflight = []") < source.indexOf('runner = spawn('));
  assert.match(source, /Static application HTML preflight cap/);
  assert.match(source, /queryReliableProcessIdentity\(child.pid\), identity/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/);
  assert.match(source, /for \(const child of \[server, runner\]\)/);
  assert.match(source, /highWaterMark: 262144/); assert.match(source, /protectedOriginalBefore/); assert.match(source, /protectedOriginalAfter/);
  assert.match(source, /conversionMemoryAcceptance: false/); assert.match(source, /await runtime.close\(\)/);
});
test("first real changed-toolchain run stays failed: eighteen browser cases passed but PUT reached an internal hosting error", async () => {
  const report = await json("evidence/2026-10-26T15-17-35-964Z-owned-privacy-offline.json");
  assert.equal(report.executedHead, "36a70a02b32a1308e2a0deff250d67ec6df819a8");
  assert.equal(report.status, "failed"); assert.equal(report.stats.expected, 18); assert.equal(report.stats.unexpected, 1);
  assert.equal(report.stats.skipped, 0); assert.equal(report.ownedRuntimeRemoved, true);
  assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
  assert.equal(report.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(report.conversionMemoryAcceptance, false); assert.equal(report.headedCoverage, false);
  const trace = await readFile("output/playwright/2026-10-26T15-17-35-964Z-privacy-failure/static-host-policy-product-8e5b5-rsion-while-serving-the-app/trace.zip");
  assert.equal(trace.length, 9660); assert.equal(createHash("sha256").update(trace).digest("hex"), "ee7c6c16d09d8886b76f6cea583eb849949547995f3a47c0642116a0378b18f4");
  const requireFromConsumer = createRequire(path.resolve("node_modules/@shuding/opentype.js/package.json"));
  const files = requireFromConsumer("fflate").unzipSync(trace);
  const network = Buffer.from(files["0-trace.network"]).toString().trim().split("\n").map(line => JSON.parse(line).snapshot);
  assert.equal(network.find(row => row?.request.method === "POST").response.status, 405);
  const put = network.find(row => row?.request.method === "PUT"); assert.equal(put.response.status, 500);
  assert.equal(put.request.bodySize, 22); // Synthetic refusal control, not a user file.
  assert.match(Buffer.from(files[`resources/${put.response.content._sha1}`]).toString(), /internal error.*reference[\s\S]*miniflare/);
});
test("worker-first-without-forwarding control stays failed and its deliberately stopped process tree/profile have native cleanup proof", async () => {
  const report = await json("evidence/2026-10-26T15-29-24-853Z-owned-privacy-offline.json");
  const stopped = await json("evidence/2026-10-26T15-37-39-034Z-owned-privacy-stop.json");
  assert.equal(report.executedHead, "56ca93b45bf7aa87d6987d3b8a10aff11ba41072");
  assert.equal(report.status, "failed"); assert.equal(report.stats, undefined); // No complete Playwright summary after intentional stop.
  assert.deepEqual(report.assetRouting, { binding: "ASSETS", runWorkerFirst: true });
  assert.equal(report.ownedRuntimeRemoved, true); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
  assert.equal(stopped.status, "failed-runner-stopped-owned-tree-absent-recorded-profiles-removed");
  assert.equal(stopped.expectedIdentity.pid, 7700); assert.equal(stopped.expectedIdentity.parentPid, 16732);
  assert.equal(stopped.expectedIdentity.createdAt, "2026-10-26T15:29:36.1017570Z");
  assert.equal(stopped.cleanup.length, 12); assert.ok(stopped.cleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(stopped.profiles.length, 1); assert.equal(stopped.profiles[0].removed, true);
  const trace = await readFile("output/playwright/2026-10-26T15-29-24-853Z-privacy-failure/privacy-offline-functional-69d73-s-pass-in-production-Chrome/trace.zip");
  assert.equal(trace.length, 171019); assert.equal(createHash("sha256").update(trace).digest("hex"), "e59f4fd581cadeaa590f773c887b5fd5a7f8e2bf77ebf4404b2bfc9243a7742c");
  const requireFromConsumer = createRequire(path.resolve("node_modules/@shuding/opentype.js/package.json"));
  const files = requireFromConsumer("fflate").unzipSync(trace);
  const network = Object.entries(files).filter(([name]) => name.endsWith(".network")).flatMap(([, bytes]) =>
    Buffer.from(bytes).toString().split("\n").filter(line => line.trim()).map(line => JSON.parse(line).snapshot));
  assert.ok(network.some(row => /\/assets\/.*\.js/.test(row?.request.url ?? "") && row.response?.status === 404));
});
test("forwarding repairs six actual bootstrap assets but the preflight correctly blocks the unchanged PUT500 before launching Chrome", async () => {
  const report = await json("evidence/2026-10-26T15-54-48-452Z-owned-privacy-offline.json");
  assert.equal(report.executedHead, "3771ef7ffb0f4e0343e8163aa8f0334446a4d5d0");
  assert.equal(report.status, "failed"); assert.equal(report.stats, undefined); assert.equal(report.processBirths.runner, null);
  assert.equal(report.assetPreflight.length, 6);
  for (const asset of report.assetPreflight) { assert.equal(asset.status, 200); assert.match(asset.mime, /text\/(?:css|javascript)/); }
  assert.deepEqual(report.methodPreflight, [{ method: "POST", status: 405, allow: "GET, HEAD" }, { method: "PUT", status: 500, allow: null }]);
  assert.equal(report.processCleanup.length, 1); assert.equal(report.processCleanup[0].status, "owned-identity-absent");
  assert.equal(report.ownedRuntimeRemoved, true); assert.deepEqual(report.protectedOriginalAfter, report.protectedOriginalBefore);
  assert.equal(report.conversionMemoryAcceptance, false); assert.equal(report.publicPromotion, false);
});
