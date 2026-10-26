import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
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
  assert.equal(pkg.overrides, undefined); assert.equal(pkg.scripts["db:generate"], undefined);
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
  assert.match(source, /queryReliableProcessIdentity\(child.pid\), identity/);
  assert.match(source, /observeOwnedProcessExit\(identity\)/);
  assert.match(source, /for \(const child of \[server, runner\]\)/);
  assert.match(source, /highWaterMark: 262144/); assert.match(source, /protectedOriginalBefore/); assert.match(source, /protectedOriginalAfter/);
  assert.match(source, /conversionMemoryAcceptance: false/); assert.match(source, /await runtime.close\(\)/);
});
