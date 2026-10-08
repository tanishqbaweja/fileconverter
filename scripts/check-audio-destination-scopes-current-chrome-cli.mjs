// Exact server-executable correction to the retained failed first runner.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, "..");
const sourcePath = "scripts/check-audio-destination-scopes-current-chrome.mjs";
const source = await readFile(path.join(root, sourcePath), "utf8");
const previous = JSON.parse(await readFile(path.join(root,
  "evidence/audio-destination-scopes-current-chrome-2026-10-08.json")));
assert.equal(previous.status, "failed-or-incomplete"); assert.equal(previous.reports.length, 0);
assert.equal(previous.exitCode, 1); assert.equal(previous.ownedRuntimeRemoved, true);
assert.equal(createHash("sha256").update(source).digest("hex"), previous.sourcePins[sourcePath]);
const command = `npm run build && "${process.execPath}" "${path.join(root, "node_modules/wrangler/bin/wrangler.js")}" dev --config dist/server/wrangler.json --port 3000`;
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);',
    `const root = ${JSON.stringify(root)}, execute = promisify(execFile);\nconst webServerCommand = ${JSON.stringify(command)};`],
  ['from "./lib/owned-runtime-scratch.mjs";',
    `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/owned-runtime-scratch.mjs")).href)};`],
  ['audio-destination-scopes-current-chrome-2026-10-08.json', 'audio-destination-scopes-current-chrome-cli-2026-10-08.json'],
  ['webServer:{...prior.webServer,cwd:', 'webServer:{...prior.webServer,command:${JSON.stringify(webServerCommand)},cwd:'],
  ['"scripts/check-audio-destination-scopes-current-chrome.mjs", "playwright.config.ts",',
    '"scripts/check-audio-destination-scopes-current-chrome.mjs", "scripts/check-audio-destination-scopes-current-chrome-cli.mjs", "playwright.config.ts",'],
];
let generated = source;
for (const [before, after] of patches) {
  assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after);
}
let reverse = generated;
for (const [before, after] of patches.toReversed()) {
  assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before);
}
assert.equal(reverse, source, "Only runner path/server command/proof and provenance differ; browser/validators unchanged");
const runtime = await createOwnedRuntimeScratch("audio-scope-cli-driver-");
try {
  const target = path.join(runtime.directory, "runner.mjs");
  await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); }
