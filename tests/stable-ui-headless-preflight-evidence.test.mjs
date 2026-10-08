import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeHeadlessStableUiLauncher } from "../scripts/lib/headless-stable-ui-golden-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("Real headless launch attempt stopped before build/browser; exact guard, executed source and owned cleanup retained", async () => {
  const proof = JSON.parse(await read("evidence/stable-ui-headless-preflight-stop-2026-10-08.json"));
  assert.equal(proof.status, "terminal-exit1-before-build-or-browser-host-memory-guard");
  assert.ok(proof.hostPreflight.freePhysicalBytes < 2 * 1024 ** 3);
  assert.ok(proof.hostPreflight.freeVirtualBytes >= 2 * 1024 ** 3);
  assert.equal(proof.hostPreflight.requiredPhysicalBytes, 2 * 1024 ** 3); assert.equal(proof.hostPreflight.safeToStart, false);
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  // Reconstruct the recorded Windows execution root on other CI checkout roots.
  const executionRoot = path.win32.dirname(path.win32.dirname(proof.cleanup.ownedWrapper));
  let generated = makeHeadlessStableUiLauncher((await read("scripts/validate-stable-progress-ui-goldens.mjs")).toString(), root);
  generated = generated.replace(`const root = ${JSON.stringify(root)}, sha =`, `const root = ${JSON.stringify(executionRoot)}, sha =`);
  generated = generated.replace(/^(import[^\r\n]*from) "(file:[^"]+\/scripts\/lib\/[^"/]+)";/gm, (_match, prefix, uri) => {
    const name = decodeURIComponent(new URL(uri).pathname).split("/scripts/lib/").at(-1);
    assert.match(name, /^[a-z0-9-]+\.mjs$/);
    const canonical = new URL(`file:///${executionRoot.replaceAll("\\", "/")}/scripts/lib/${name}`).href;
    return `${prefix} ${JSON.stringify(canonical)};`;
  });
  assert.equal(Buffer.byteLength(generated), proof.generatedLauncher.bytes); assert.equal(sha(generated), proof.generatedLauncher.sha256);
  assert.ok(proof.generatedLauncher.provenance.includes("reconstruction after terminal"));
  await assert.rejects(access(proof.cleanup.ownedWrapper), { code: "ENOENT" });
  for (const name of ["visibleBrowserLaunched", "headlessBrowserLaunched", "candidateBuildStarted", "protectedOriginalRead",
    "unrelatedApplicationsClosed", "publicAcceptance", "conversionSpeedAcceptance", "completeChromiumMemoryAcceptance"]) assert.equal(proof[name], false);
  assert.equal(proof.conversionsStarted, 0); assert.equal(proof.convertedFilesCreated, 0);
});
