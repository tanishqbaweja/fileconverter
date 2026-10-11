// Preserve the executed full harness and its gates; qualify only new identities.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

export const ALIGNMENT16_FULL_FILES = ["scripts/lib/alignment16-full-recipe.mjs",
  "scripts/run-alignment16-original-full.mjs", "scripts/stage-alignment16-full.mjs", "tests/alignment16-full.test.mjs",
  "scripts/lib/qualified-attempt-full-stager.mjs", "scripts/lib/allocation-attempt-full-driver.mjs",
  "scripts/lib/composite-allocation-failure-record.mjs", "scripts/run-allocation-attempt-original-full.mjs",
  "scripts/stage-allocation-attempt-full.mjs"];
const originals = {
  "scripts/lib/qualified-attempt-full-stager.mjs": "854a92e5d8a78c62798fb69dd370d95177600db3dcb761880a91056ee4ee1c4b",
  "scripts/lib/allocation-attempt-full-driver.mjs": "61aaa1ba5339e4c4400bb35ac83398464ce5cb48a58b95aab0d3d0ca6beb8fc4",
  "scripts/lib/composite-allocation-failure-record.mjs": "b017acf4e5abb6092e45b46eda7618800f38d04da3adbcb3c174baf8e23cfd16",
  "scripts/run-allocation-attempt-original-full.mjs": "2ab2d83f597c66b8594d720ae8f2da0325aff7e8a14e6d605ffb1d6146a793c8",
  "scripts/stage-allocation-attempt-full.mjs": "4f1cc9c23b6acf99fb3464e06c749eeb8f3234be73b927f80be76f1a7380f12d",
};
const rootDefault = path.resolve(import.meta.dirname, "../..");
async function derive(root, file, mappings, edits = []) {
  root = path.resolve(root);
  const prior = await readFile(path.join(root, file), "utf8");
  assert.equal(sha(prior), originals[file], file);
  const imports = [...prior.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)];
  for (const match of imports) {
    const relative = path.relative(root, path.resolve(root, path.dirname(file), match[1])).replaceAll("\\", "/");
    const target = mappings[relative] ?? relative;
    edits.unshift([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.join(root, target)).href)}`), 1]);
  }
  let generated = prior;
  for (const [before, after, count = 1] of edits) {
    assert.notEqual(before, after); assert.equal(generated.split(before).length - 1, count, before);
    generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after, count = 1] of edits.toReversed()) {
    assert.equal(reversed.split(after).length - 1, count, after); reversed = reversed.replaceAll(after, before);
  }
  assert.equal(reversed, prior, "Qualification changes reverse to exact executed source");
  return { generated, edits, previousSha256: sha(prior), generatedSha256: sha(generated) };
}
const factory = "scripts/lib/alignment16-full-recipe.mjs";
const candidate = "scripts/lib/alignment16-plane-candidate.mjs";
const importDerived = recipe => import(`data:text/javascript;base64,${Buffer.from(recipe.generated).toString("base64")}`);
export async function qualifiedStagerRecipe(root = rootDefault) {
  return derive(root, "scripts/lib/qualified-attempt-full-stager.mjs", {
    "scripts/lib/allocation-attempt-media-recipe.mjs": "scripts/lib/alignment16-media-recipe.mjs",
  }, [
    ["2026-10-11T13-23-21-737Z-allocation-attempt-media", "2026-10-11T18-21-53-018Z-alignment16-media"],
    ["b0f8fe797130a82f0b53444aa901c6cc07dc080e6c1e2b4f30d29decef20bc3b", "c13be40d56d35205dfdc51942cd2eb3cb641775afc9348869861cd5b50ec741f"],
    ["136", "146", 2],
  ]);
}
export async function loadQualifiedAttemptMediaSources(root) {
  return (await importDerived(await qualifiedStagerRecipe(root))).loadQualifiedAttemptMediaSources(root);
}
export async function makeQualifiedAttemptFullStager(root, name) {
  return (await importDerived(await qualifiedStagerRecipe(root))).makeQualifiedAttemptFullStager(root, name);
}
export async function failureRecordRecipe(root = rootDefault) {
  return derive(root, "scripts/lib/composite-allocation-failure-record.mjs", {
    "scripts/lib/allocation-attempt-abort-capture.mjs": "scripts/lib/alignment16-attempt-abort-capture.mjs",
  });
}
const failureValidator = await importDerived(await failureRecordRecipe());
export const validateCompositeAllocationFailureRecord = failureValidator.validateCompositeAllocationFailureRecord;
export async function fullDriverFactoryRecipe(root = rootDefault) {
  return derive(root, "scripts/lib/allocation-attempt-full-driver.mjs", {
    "scripts/lib/qualified-attempt-full-stager.mjs": factory,
  }, [
    ['moduleUrl("allocation-attempt-plane-candidate.mjs")', 'moduleUrl("alignment16-plane-candidate.mjs")'],
    ['moduleUrl("composite-allocation-failure-record.mjs")', 'moduleUrl("alignment16-full-recipe.mjs")'],
    ["scripts/stage-allocation-attempt-full.mjs", "scripts/stage-alignment16-full.mjs"],
    ["-private-mpeg2-allocation-attempt-full-native-100ms", "-private-mpeg2-alignment16-full-native-100ms"],
    ["hevc-allocation-attempt-plus-encoder-plane", "hevc-alignment16-plus-encoder-plane"],
  ]);
}
export async function makeAllocationAttemptFullDriver(root, runtime, name, files) {
  return (await importDerived(await fullDriverFactoryRecipe(root))).makeAllocationAttemptFullDriver(root, runtime, name, files);
}
export async function makeAlignment16FullCaller(root = rootDefault) {
  return derive(root, "scripts/run-allocation-attempt-original-full.mjs", {
    "scripts/lib/qualified-attempt-full-stager.mjs": factory,
    "scripts/lib/allocation-attempt-plane-candidate.mjs": candidate,
    "scripts/lib/allocation-attempt-full-driver.mjs": factory,
    "scripts/lib/composite-allocation-failure-record.mjs": factory,
  }, [
    ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(path.resolve(root))}`],
    ['"AGENTS.md", "MONITORING.md", media.reference.path', `${ALIGNMENT16_FULL_FILES.map(file => JSON.stringify(file)).join(", ")}, "AGENTS.md", "MONITORING.md", media.reference.path`],
    ["|allocation-attempt)-full-live", "|allocation-attempt|alignment16)-full-live"],
    ["-allocation-attempt-full-live.json", "-alignment16-full-live.json"],
    ["-private-mpeg2-allocation-attempt-full-native-100ms.json", "-private-mpeg2-alignment16-full-native-100ms.json"],
    ["${stamp}-allocation-attempt-original-full", "${stamp}-alignment16-original-full"],
  ]);
}
export async function makeAlignment16StagerCaller(root = rootDefault) {
  return derive(root, "scripts/stage-allocation-attempt-full.mjs", {
    "scripts/lib/allocation-attempt-plane-candidate.mjs": candidate,
    "scripts/lib/qualified-attempt-full-stager.mjs": factory,
  }, [['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(path.resolve(root))}`]]);
}
