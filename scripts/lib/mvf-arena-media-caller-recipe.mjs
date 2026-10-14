import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeMvfMediaCaller(source, root) {
  const oldImport = 'import { ebmlMediaParts } from "./lib/ebml-reuse-media-recipe.mjs";';
  const edits = [
    ['root=path.resolve(import.meta.dirname,"..")', `root=${JSON.stringify(root)}`],
    [oldImport, `import { ebmlMediaParts } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/mvf-arena-media-recipe.mjs")).href)};`],
    ["process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT", "process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT"],
    ["-ebml-reuse-browser-control-executed-sources", "-mvf-arena-browser-control-executed-sources"],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/ebml-reuse-media-recipe.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/mvf-arena-media-recipe.mjs")).href;'],
    ['"scripts/qualify-ebml-reuse-media.mjs","scripts/lib/ebml-reuse-media-recipe.mjs","scripts/lib/ebml-reuse-browser-components.mjs",',
      '"scripts/qualify-mvf-arena-media.mjs","scripts/lib/mvf-arena-media-caller-recipe.mjs","scripts/lib/mvf-arena-media-recipe.mjs","scripts/lib/mvf-arena-browser-components.mjs","scripts/qualify-ebml-reuse-media.mjs","scripts/lib/ebml-reuse-media-recipe.mjs","scripts/lib/ebml-reuse-browser-components.mjs",'],
    ['JSON.stringify({recipe,sourcePins,preimages})', 'JSON.stringify({recipe,executedQualifierSource:await readFile(new URL(import.meta.url),"utf8"),sourcePins,preimages})'],
    ["const runtime=await createOwnedRuntimeScratch(\"ebml-reuse-media-caller-\")", "const runtime=await createOwnedRuntimeScratch(\"mvf-arena-media-caller-\")"],
    ["${stamp}-ebml-reuse-media", "${stamp}-mvf-arena-media"],
  ];
  // There are three report namespace occurrences; preserve all in one edit.
  const namespace = source.match(/\$\{stamp\}-ebml-reuse-media/g) ?? [];
  edits.pop(); edits.push([source, source.replaceAll("${stamp}-ebml-reuse-media", "${stamp}-mvf-arena-media")]);
  // Whole-parent namespace edit must run before its anchored local edits.
  const whole = edits.pop(); edits.unshift(whole);
  if (namespace.length !== 3) throw new Error("Exact parent report namespace changed");
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    if (match[0] === oldImport) continue;
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
  }
  return exactPatch(source, edits);
}
