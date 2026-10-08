// Preserve the actual failed verifier; fix PID reuse with exact birth identities.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
assert.equal(process.argv.length, 3);
const source = await readFile(path.join(root, "scripts/freeze-ui-js-allocation.mjs"), "utf8");
assert.equal(sha(source), "0e207b11611e6cc2fc770be406ed6750ad3280ef9d68874f170ba458c9acaf76");
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ['assert.deepEqual(live, [], "Every observed PID must be absent; do not kill or silently ignore a reused PID");',
    `const identityCleanup = verifyJsProbeIdentityAbsence(identities, live);
for (const pid of Object.values(raw.ownedPids)) assert.ok(!live.some(entry => entry.pid === pid), "Helper birth unavailable; root PID must actually be absent");`],
  ['  verifier: { path: "scripts/freeze-ui-js-allocation.mjs", sha256: sha(await readFile(path.join(root, "scripts/freeze-ui-js-allocation.mjs"))) },',
    '  verifier: { path: "scripts/freeze-ui-js-allocation-bound.mjs", sha256: sha(await readFile(path.join(root, "scripts/freeze-ui-js-allocation-bound.mjs"))), failedOriginalPath: "scripts/freeze-ui-js-allocation.mjs", failedOriginalSha256: "0e207b11611e6cc2fc770be406ed6750ad3280ef9d68874f170ba458c9acaf76", identityHelperSha256: sha(await readFile(path.join(root, "scripts/lib/js-probe-identity-cleanup.mjs"))) },'],
  ['  observedPidsAbsent: pids, nativeIdentityCleanupVerified: true, cleanup: raw.cleanup,',
    '  observedPidsAbsent: pids.filter(pid => !live.some(entry => entry.pid === pid)), identityCleanup, nativeIdentityCleanupVerified: true, cleanup: raw.cleanup,'],
];
let generated = source;
for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
assert.equal(reversed, source, "Only PID identity/provenance binding changes; all raw/source/privacy/profile/cap/compression gates retained");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
generated = `import { verifyJsProbeIdentityAbsence } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/js-probe-identity-cleanup.mjs")).href)};\n` + generated;
const runtime = await createOwnedRuntimeScratch("ui-js-verifier-wrapper-");
try { const target = path.join(runtime.directory, "verifier.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
