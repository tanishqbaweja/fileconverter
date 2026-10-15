// Reuse every captured-word guard with fresh actual-native addresses/identity.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { DURATION_DECODER_SHA256 } from "./duration-drain-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const proof = JSON.parse(await readFile(path.join(root, "evidence/duration-drain-native-38678806473.json")));
const parent = JSON.parse(await readFile(path.join(root, "evidence/mvf-arena-native-38643550000.json")));
assert.equal(proof.decoder.sha256, DURATION_DECODER_SHA256);
const source = await readFile(path.join(root, "scripts/lib/mvf-arena-full-failure.mjs"), "utf8");
assert.equal(sha(source), "c12dbf3e893d7f0fbc2b0bf651f533624b9b05a59b275e4beda1dfd0d9c2e848");
// The parent validator already derives addresses from its proof; substitute the
// current proof, never edit individual numeric guards or invent heap contents.
const recipe = exactPatch(source, [
  ['const root = path.resolve(import.meta.dirname, "../..");', `const root = ${JSON.stringify(root)};`],
  ['import { MVF_DECODER_SHA256 } from "./mvf-arena-browser-components.mjs";',
    'import { DURATION_DECODER_SHA256 as MVF_DECODER_SHA256 } from "./duration-drain-browser-components.mjs";'],
  ["evidence/mvf-arena-native-38643550000.json", "evidence/duration-drain-native-38678806473.json"],
]);
const generated = recipe.generated.replace(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm, (match, file) =>
  match.replace(`from "${file}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href)}`));
const factory = await import("data:text/javascript;base64," + Buffer.from(generated).toString("base64"));
assert.deepEqual(factory.ebmlFailureDerivation.currentNativeAddresses, proof.layout);
export const validateCompositeAllocationFailureRecord = factory.validateCompositeAllocationFailureRecord;
export const durationFailureDerivation = Object.freeze({ ...recipe, generatedSha256: sha(generated),
  currentNativeAddresses: proof.layout, previousNativeAddresses: parent.layout, capturedWordGuardsChanged: false,
  heapOrModuleFabricated: false, publicAcceptance: false });
