import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeMvfNativeQualifier(source, root, revision = "") {
  assert.ok(["", "smoke-warnings"].includes(revision)); const suffix = revision ? `-${revision}` : "";
  assert.equal(sha(source), "8a426446d2b8b995294bd185c669ca7767bb2b754f75c6d88639aa349531c407");
  const edits = [
    ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(root)}`],
    ["mpeg2-ebml-reuse-build-${runId}", "mpeg2-mvf-arena-build-${runId}"],
    ["mpeg2-ebml-reuse-build-branch-2026-10-14.json", `mpeg2-mvf-arena-build-branch-2026-10-15${suffix}.json`],
    ...(revision ? [["assert.equal(process.argv.length, 3)", "assert.equal(process.argv.length, 4)"]] : []),
    ["mpeg2-realloc-attempt-build-38526781934.json", "mpeg2-ebml-reuse-build-38608791023.json"],
    ["...EBML_REUSE_NATIVE_FILES", "...MVF_NATIVE_FILES"],
    ["assert.equal(expectedFiles.length, 93)", "assert.equal(expectedFiles.length, 99)"],
    ["realloc-attempt|ebml-reuse", "realloc-attempt|ebml-reuse|mvf-arena"],
    ["work/mpeg2-ebml-reuse-${runId}", "work/mpeg2-mvf-arena-${runId}"],
    ['["within_ebml_release", [2,0]]', '["within_ebml_release", [2,0]], ["av_buffer_allocz", [1,1]], ["av_malloc", [1,1]], ["av_refstruct_pool_get", [1,1]], ["mpeg2_packets", [2,1]], ["__wrap_posix_memalign", [2,1]]'],
    ["outputs/reports/ebml-reuse-native-sources-${runId}", "outputs/reports/mvf-arena-native-sources-${runId}"],
    ["scripts/qualify-ebml-reuse-native.mjs", "scripts/qualify-mvf-arena-native.mjs"],
    ["evidence/ebml-reuse-native-${runId}", "evidence/mvf-arena-native-${runId}"],
    ["actual-native-ebml-reuse-controls-and-static-ABI-not-browser-acceptance", "actual-native-mvf-arena-controls-and-static-ABI-not-browser-acceptance"],
    ["actualEbmlReuse: build.manifest.ebmlReuse,", "actualMvfArena: build.manifest.mvfArena, actualEbmlReuse: build.manifest.ebmlReuse,"],
  ];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative = match[1] === "../media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs" ? "../media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs" : match[1];
    const before = match[0], after = before.replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", relative)).href)}`)
      .replace("{ EBML_REUSE_NATIVE_FILES }", "{ MVF_NATIVE_FILES }");
    edits.push([before, after]);
  }
  return exactPatch(source, edits);
}
