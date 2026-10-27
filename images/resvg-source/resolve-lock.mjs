import assert from "node:assert/strict";
import { readFile, writeFile, lstat, realpath } from "node:fs/promises";
import path from "node:path";
import { pins, sha, pinCargoManifest, inspectCandidateLock } from "./source-pins.mjs";
const [mode, scratch, output] = process.argv.slice(2);
assert.ok(["prepare", "record"].includes(mode) && process.argv.length === 5);
const root = path.resolve(import.meta.dirname, "../.."), work = path.join(root, "work");
assert.equal(path.dirname(scratch), work); assert.match(path.basename(scratch), /^resvg-source-lock-[a-zA-Z0-9]{6}$/);
assert.equal(path.dirname(output), path.join(root, "outputs/reports"));
assert.match(path.basename(output), /^resvg-source-lock-[0-9]+$/);
for (const directory of [scratch, output]) {
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink());
  assert.equal(await realpath(directory), directory);
}
const cargoPath = path.join(scratch, "source/Cargo.toml");
if (mode === "prepare") {
  const original = await readFile(cargoPath);
  await writeFile(path.join(scratch, "Cargo.upstream.toml"), original, { flag: "wx" });
  await writeFile(cargoPath, pinCargoManifest(original));
} else {
  const lock = await readFile(path.join(scratch, "source/Cargo.lock"), "utf8"), summary = inspectCandidateLock(lock);
  const patchedCargo = await readFile(cargoPath);
  assert.equal(sha(patchedCargo), sha(pinCargoManifest(await readFile(path.join(scratch, "Cargo.upstream.toml")))));
  await writeFile(path.join(output, "Cargo.lock"), lock, { flag: "wx" });
  await writeFile(path.join(output, "Cargo.pinned.toml"), patchedCargo, { flag: "wx" });
  const report = { schemaVersion: 1, status: "resolved-private-candidate-lock-not-source-build-acceptance", pins,
    lock: summary, patchedCargoSha256: sha(patchedCargo),
    cargoVersion: (await readFile(path.join(scratch, "cargo-version.txt"), "utf8")).trim(),
    sourceCompilationAttempted: false, publishedEngineChanged: false, conversionRun: false,
    byteExactPublicationReproduction: false, historicalDependencyGraphRecovered: false,
    compilerCompatibilityVerified: false, browserOrMemoryAcceptance: false,
    remaining: "Review lock, then compile with recorded nightly and pinned wasm-bindgen tools; different bytes remain private until qualified" };
  await writeFile(path.join(output, "provenance.json"), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report));
}
