// Preserve every captured-word guard, rebinding only exact native identity/ABI.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { loadJspiBrowserNative } from "./jspi-browser-native.mjs";
const root = path.resolve(import.meta.dirname, "../.."), native = await loadJspiBrowserNative(root);
const source = await readFile(path.join(root, "scripts/lib/mvf-arena-full-failure.mjs"), "utf8");
const recipe = exactPatch(source, [
  ['const root = path.resolve(import.meta.dirname, "../..");', `const root = ${JSON.stringify(root)};`],
  ['import { MVF_DECODER_SHA256 } from "./mvf-arena-browser-components.mjs";', 'import { JSPI_DECODER_SHA256 as MVF_DECODER_SHA256 } from "./jspi-browser-native.mjs";'],
  ["evidence/mvf-arena-native-38643550000.json", "evidence/jspi-native-sources-39072949964.json"],
]);
const generated = recipe.generated.replace(/^(import[^\r\n]*?\bfrom )"(\.[^"\r\n]+)"/gm,
  (_, prefix, file) => prefix + JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", file)).href));
const factory = await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
assert.deepEqual(factory.ebmlFailureDerivation.currentNativeAddresses, native.proof.layout);
export const validateCompositeAllocationFailureRecord = factory.validateCompositeAllocationFailureRecord;
export const jspiFailureDerivation = { ...recipe, capturedWordGuardsChanged: false, currentNativeAddresses: native.proof.layout, publicAcceptance: false };
