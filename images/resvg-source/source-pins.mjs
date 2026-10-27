// Private dependency reconstruction, never a public engine build or conversion.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const pins = Object.freeze({
  upstream: "9ca058462ac529120c8cc84ddcd6fef644cc5406",
  cargoTomlSha256: "72880b4d3e64bd62caf033579a21057c97ed069002bdef67a0029b7fc6e340a9",
  resvg: "3495d8705b302d6d266748516973606ca9657906",
  woff2: "88cce4cd07da2c3f35839068c6f73672700cfc8b",
  wasmBindgen: "0.2.92", jsSys: "0.3.69",
  resolverToolchain: "1.90.0", compilerToolchain: "nightly-2023-12-11",
  resolverManifestSha256: "489c19f20d331765ab2835661eb546de90f6446a107a8db83045e7371e45cae2",
});
export const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export function pinCargoManifest(source) {
  assert.equal(sha(source), pins.cargoTomlSha256, "Exact upstream Cargo.toml required before rewriting");
  let text = source.toString();
  for (const [before, after] of [
    ['edition = "2021"', 'edition = "2021"\nrust-version = "1.76"'],
    ['wasm-bindgen = "0.2.87"', `wasm-bindgen = "=${pins.wasmBindgen}"`],
    ['js-sys = "0.3.64"', `js-sys = "=${pins.jsSys}"`],
    ['rev = "3495d870"', `rev = "${pins.resvg}"`],
    ['branch="fix-total-compressed-size"', `rev="${pins.woff2}"`],
  ]) {
    assert.equal(text.split(before).length, 2, `Exactly one source anchor: ${before}`);
    text = text.replace(before, after);
  }
  return text;
}
export function inspectCandidateLock(text) {
  assert.ok(Buffer.byteLength(text) <= 262144, "Bounded lock evidence");
  const packages = text.split("[[package]]").slice(1).map(section => {
    const field = name => section.match(new RegExp('^' + name + ' = "([^"\\n]+)"$', "m"))?.[1] ?? null;
    const row = { name: field("name"), version: field("version"), source: field("source"), checksum: field("checksum") };
    assert.ok(row.name && row.version);
    if (row.source?.startsWith("registry+")) assert.match(row.checksum ?? "", /^[a-f0-9]{64}$/);
    if (row.source?.startsWith("git+")) assert.match(row.source, /#[a-f0-9]{40}$/);
    return row;
  });
  assert.ok(packages.length > 10 && packages.length <= 1000);
  for (const [name, version] of [["wasm-bindgen", pins.wasmBindgen], ["js-sys", pins.jsSys]])
    assert.deepEqual(packages.filter(row => row.name === name).map(row => row.version), [version]);
  for (const [name, revision] of [["resvg", pins.resvg], ["woff2", pins.woff2]]) {
    const rows = packages.filter(row => row.name === name); assert.equal(rows.length, 1);
    assert.ok(rows[0].source?.endsWith("#" + revision), `Locked ${name} revision`);
    assert.ok(rows[0].source.includes("rev=" + revision), `Full requested ${name} revision`);
  }
  return { bytes: Buffer.byteLength(text), sha256: sha(text), packages: packages.length,
    registryPackages: packages.filter(row => row.source?.startsWith("registry+")).length,
    gitPackages: packages.filter(row => row.source?.startsWith("git+")).length,
    initialCandidateLockNotHistoricalPublicationLock: true };
}
