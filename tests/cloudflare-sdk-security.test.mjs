import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const requireFromMiniflare = createRequire(path.resolve("node_modules/miniflare/package.json"));

test("SDK/plugin pins align with one runtime and the exact reviewed HTTP-client override", async () => {
  const pkg = await json("package.json"), lock = await json("package-lock.json");
  const versions = { "@cloudflare/vite-plugin": "1.65.0", wrangler: "4.152.0", miniflare: "5.20261019.2-beta",
    workerd: "1.20261019.1", undici: "7.30.1", sharp: "0.35.5", ws: "8.22.0" };
  for (const [name, version] of Object.entries(versions)) {
    assert.equal((await json(`node_modules/${name}/package.json`)).version, version, `Installed ${name}`);
    assert.equal(lock.packages[`node_modules/${name}`].version, version, `Locked ${name}`);
  }
  assert.equal(pkg.devDependencies["@cloudflare/vite-plugin"], versions["@cloudflare/vite-plugin"]);
  assert.equal(pkg.devDependencies.wrangler, versions.wrangler);
  assert.deepEqual(pkg.overrides, { "miniflare@5.20261019.2-beta": { undici: "7.30.1" }, "vinext@0.0.50": { "image-size": "2.0.3" } });
  assert.equal(requireFromMiniflare("undici/package.json").version, "7.30.1", "Actual consumer resolves the patched client");
  assert.equal((await json("node_modules/@cloudflare/vite-plugin/package.json")).dependencies.wrangler, versions.wrangler);
  assert.deepEqual(Object.keys(lock.packages).filter(key => /node_modules\/(?:wrangler|miniflare|workerd|undici)$/.test(key)).sort(),
    ["node_modules/miniflare", "node_modules/undici", "node_modules/workerd", "node_modules/wrangler"]);
});

test("fresh same-day audits remove precisely seven SDK advisory groups; two framework findings remain visible", async () => {
  const before = await json("evidence/2026-10-27-cloudflare-audit-before.json");
  const after = await json("evidence/2026-10-27-cloudflare-audit-after.json");
  assert.deepEqual(before.audit.metadata.vulnerabilities, { info: 0, low: 1, moderate: 0, high: 8, critical: 0, total: 9 });
  assert.deepEqual(after.audit.metadata.vulnerabilities, { info: 0, low: 0, moderate: 0, high: 2, critical: 0, total: 2 });
  assert.deepEqual(Object.keys(after.audit.vulnerabilities).sort(), ["image-size", "vinext"]);
  assert.deepEqual(Object.keys(before.audit.vulnerabilities).filter(name => !after.audit.vulnerabilities[name]).sort(),
    ["@cloudflare/vite-plugin", "esbuild", "miniflare", "sharp", "undici", "wrangler", "ws"].sort());
  assert.equal(before.cleanup.ownedScratchRemoved, true); assert.equal(after.cleanup.ownedScratchRemoved, true);
  assert.equal(after.auditExitCode, 1, "Two unresolved high groups are not a clean security result");
  assert.deepEqual(before.graphRoot.dependencies, after.graphRoot.dependencies, "No app/React/framework/codec migration");
  const expectedDev = { ...before.graphRoot.devDependencies, "@cloudflare/vite-plugin": "1.65.0", wrangler: "4.152.0" };
  assert.deepEqual(after.graphRoot.devDependencies, expectedDev);
});

test("published SDK declarations keep the used inline config API; compatibility semantics remain pinned", async () => {
  const contract = await json("evidence/2026-10-27-cloudflare-candidate-contract.json");
  const types = await readFile("node_modules/@cloudflare/vite-plugin/dist/index.d.mts", "utf8");
  assert.equal(createHash("sha256").update(types).digest("hex"), contract.plugin.publishedTypesSha256);
  assert.match(types, /config\?: WorkerConfigCustomizer<true>/);
  const config = await readFile("vite.config.ts", "utf8");
  assert.match(config, /compatibility_date: "2026-05-15"/);
  assert.match(config, /config: localBindingConfig/); assert.match(config, /run_worker_first: true/);
  assert.match(config, /compatibility_flags: \["nodejs_compat"\]/);
});

test("reviewed lock derivation stays within the SDK, native-platform and renderer-deduplication families", async () => {
  const before = (await json("evidence/2026-10-27-cloudflare-audit-before.json")).packageEntries;
  const after = (await json("evidence/2026-10-27-cloudflare-audit-after.json")).packageEntries;
  assert.equal(Object.keys(before).length, 687); assert.equal(Object.keys(after).length, 662);
  assert.deepEqual(Object.keys(after).filter(key => !before[key]), ["node_modules/miniflare/node_modules/ws"]);
  const removed = Object.keys(before).filter(key => !after[key]); assert.equal(removed.length, 26);
  for (const key of removed) assert.match(key, /^node_modules\/(?:@img\/sharp-wasm32|next\/node_modules\/(?:@img\/sharp-[^/]+|sharp|semver))$/);
  const changed = Object.keys(after).filter(key => before[key] && before[key] !== after[key]);
  assert.ok(changed.length > 40);
  for (const key of changed) assert.match(key,
    /^node_modules\/(?:@cloudflare\/(?:unenv-preset|vite-plugin|workerd-[^/]+)|@img\/sharp-[^/]+(?:\/node_modules\/(?:@emnapi\/runtime|@img\/sharp-wasm32))?|@speed-highlight\/core|miniflare|sharp(?:\/node_modules\/semver)?|undici|workerd|wrangler(?:\/node_modules\/(?:@esbuild\/[^/]+|esbuild))?|ws)$/);
});

test("actual Miniflare Request/Response interoperate with its patched client's fetch, headers, body and abort APIs", async () => {
  const mf = requireFromMiniflare("miniflare"), undici = requireFromMiniflare("undici");
  const dispatcher = new undici.MockAgent(); dispatcher.disableNetConnect();
  try {
    const origin = dispatcher.get("http://sdk-control.invalid");
    origin.intercept({ path: "/synthetic", method: "POST", body: "synthetic-control-only" }).reply(200, "bounded-response", {
      headers: { "content-type": "text/plain", "x-control": "same-consumer" } });
    const input = new mf.Request("http://sdk-control.invalid/synthetic", { method: "POST", body: "synthetic-control-only" });
    assert.ok(input instanceof undici.Request);
    const response = await undici.fetch(input, { dispatcher, signal: AbortSignal.timeout(3000) });
    assert.equal(response.status, 200); assert.equal(response.headers.get("x-control"), "same-consumer");
    assert.equal(await response.text(), "bounded-response");
    const wrapped = new mf.Response("bounded", { headers: new mf.Headers({ "x-control": "wrapper" }) });
    assert.equal(await wrapped.clone().text(), "bounded"); assert.equal(await wrapped.text(), "bounded");
    const controller = new AbortController(); controller.abort();
    await assert.rejects(undici.fetch("http://sdk-control.invalid/not-dispatched", { dispatcher, signal: controller.signal }), { name: "AbortError" });
    dispatcher.assertNoPendingInterceptors();
  } finally { await dispatcher.close(); }
});

test("changed default Windows SDK completes all nineteen unchanged privacy cases, not an alternate-host or memory claim", async () => {
  const value = await json("evidence/2026-10-27T10-21-32-023Z-owned-privacy-offline.json");
  const earlier = await json("evidence/2026-10-27T10-04-13-785Z-owned-privacy-offline.json");
  const audit = await json("evidence/2026-10-27-cloudflare-audit-after.json");
  assert.equal(value.status, "passed-complete-headless-privacy-offline-hosting-specs");
  assert.equal(value.hostingRuntime, "wrangler-miniflare"); assert.equal(value.directRuntime, undefined);
  assert.equal(value.stats.expected, 19); assert.equal(value.stats.unexpected, 0);
  assert.equal(value.stats.skipped, 0); assert.equal(value.stats.flaky, 0);
  assert.equal(value.sourcePins["package.json"], audit.packageSha256);
  assert.equal(value.sourcePins["package-lock.json"], audit.lockSha256);
  for (const file of ["worker/index.ts", "lib/static-host-request-policy.ts", "tests/browser/privacy-offline.spec.ts", "tests/browser/static-host-policy.spec.ts"])
    assert.equal(value.sourcePins[file], earlier.sourcePins[file], `Actual app policy/specs unchanged: ${file}`);
  assert.equal(value.methodPreflight.length, 5); assert.ok(value.methodPreflight.every(row => row.status === 405));
  assert.equal(value.assetPreflight.length, 6); assert.ok(value.assetPreflight.every(row => row.status === 200));
  assert.equal(value.ownedRuntimeRemoved, true); assert.equal(value.processCleanup.length, 2);
  assert.ok(value.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(value.protectedOriginalAfter, value.protectedOriginalBefore);
  assert.equal(value.protectedOriginalAfter.bytes, 2958573265);
  assert.equal(value.protectedOriginalAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(value.headedCoverage, false); assert.equal(value.conversionMemoryAcceptance, false); assert.equal(value.publicPromotion, false);
});
