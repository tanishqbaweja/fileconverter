import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
export const AIFF_STRESS_BASE_SHA = "b4ab56636eb381df7eeae9f18a28db8a8301c4f20b0e0f9a106b7eb0bad1965c";
export function makeAiffId3StressRecipe(source, root, directory) {
  assert.equal(createHash("sha256").update(source).digest("hex"), AIFF_STRESS_BASE_SHA);
  assert.equal(path.dirname(directory), path.join(root, "work"));
  const uri = file => pathToFileURL(path.join(root, file)).href;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const edits = [
    ['const projectRoot = path.resolve(\n  path.dirname(fileURLToPath(import.meta.url)),\n  "..",\n);', `const projectRoot = ${JSON.stringify(root)};\nvoid fileURLToPath;`],
    ['const profileRoot = path.resolve(workRoot, "memory-profile-chrome");', `const profileRoot = ${JSON.stringify(path.join(directory, "chrome-profile"))};`],
    ['const reportRoot = path.resolve(projectRoot, "outputs", "reports");',
      `const reportRoot = ${JSON.stringify(path.join(root, "outputs/reports", path.basename(directory)))};`],
    ['  env: options.env ?? runtimeScratch?.env ?? process.env,', '  env: options.env ?? runtimeScratch?.env ?? process.env,\n  windowsHide: true,'],
    ['  mkdir,\n', '  mkdir,\n  lstat,\n  realpath,\n'],
    ['const sourceHashes = {};', `const sourceHashes = {};\nconst launches = new Map(), directories = new Map(), forbiddenRequests = [];\n` +
      `import { queryProcessIdentity, observeOwnedProcessExit } from ${JSON.stringify(uri("scripts/lib/owned-process-exit-observation.mjs"))};\n` +
      'async function recordLaunch(pid, role) { const identity = await queryProcessIdentity(pid);\n' +
      '  if (!identity || identity.parentPid !== process.pid) throw new Error("Unverified helper birth");\n' +
      '  launches.set(pid, { role, identity, absence: null }); }\n' +
      'async function recordDirectory(target) { const info = await lstat(target, { bigint: true });\n' +
      '  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(target) !== target) throw new Error("Unowned scratch");\n' +
      '  directories.set(target, { dev: info.dev, ino: info.ino }); }'],
    ['  profileOwned = true;', '  profileOwned = true;\n  await recordDirectory(profileRoot);'],
    ['  await waitForServer(serverUrl, 30_000);', '  await recordLaunch(serverProcess.pid, "production-server");\n  await waitForServer(serverUrl, 30_000);'],
    ['  nativeTemporary = await mkdtemp(path.join(workRoot, "memory-observer-"));',
      '  await recordLaunch(chromeProcess.pid, "headless-chrome");\n  nativeTemporary = await mkdtemp(path.join(workRoot, "memory-observer-"));\n  await recordDirectory(nativeTemporary);'],
    ['  nativeObserver = await startParallelMemoryObserver(chromeProcess.pid, nativeTemporary);',
      '  nativeObserver = await startParallelMemoryObserver(chromeProcess.pid, nativeTemporary);\n  await recordLaunch(nativeObserver.pid, "read-only-memory-observer");'],
    ['  const context = browser.contexts()[0];', '  const context = browser.contexts()[0];\n' +
      '  await context.route("**/*", route => { const request = route.request();\n' +
      '    if (!request.url().startsWith(serverUrl + "/") || !["GET", "HEAD"].includes(request.method()) || request.postData()) {\n' +
      '      forbiddenRequests.push({ method: request.method(), url: request.url().slice(0, 256) }); return route.abort(); }\n' +
      '    return route.continue(); });'],
    ['    "blank-baseline",\n    samples,\n  );', '    "blank-baseline",\n    samples,\n    null,\n    90_000,\n  );'],
    [': 128 * 1024 * 1024;', ': 32 * 1024 * 1024;'],
    ['    if (!(mp3Output || flacOutput) || attachedPictures.length !== 1) {',
      '    if (!(mp3Output || flacOutput || aiffOutput) || attachedPictures.length !== 1) {'],
    ['    source.artwork && (mp3Output || flacOutput) ? 1 : 0;',
      '    source.artwork && (mp3Output || flacOutput || aiffOutput) ? 1 : 0;'],
    ['  const checks = {\n', '  const checks = {\n    networkPrivacy: forbiddenRequests.length === 0,\n    aiffCancellation: cancellationCheck?.passed === true,\n'],
    ['async function killProcessTree(pid) {\n  try {', 'async function killProcessTree(pid) {\n' +
      '  const row = launches.get(pid); if (!row) throw new Error("Refusing unrecorded PID cleanup");\n' +
      '  const current = await queryProcessIdentity(pid); if (!current) return;\n' +
      '  if (current.parentPid !== row.identity.parentPid || Math.abs(Date.parse(current.createdAt) - Date.parse(row.identity.createdAt)) >= 1)\n' +
      '    throw new Error("Refusing reused or unrelated PID cleanup");\n  try {'],
    ['async function removeWithRetries(target) {\n', 'async function removeWithRetries(target) {\n' +
      '  const identity = directories.get(target), current = await lstat(target, { bigint: true });\n' +
      '  if (!identity || !current.isDirectory() || current.isSymbolicLink() || await realpath(target) !== target ||\n' +
      '      current.dev !== identity.dev || current.ino !== identity.ino) throw new Error("Refusing replaced/unowned directory cleanup");\n'],
    ['    async () => { await runtimeScratch?.close(); },\n  ]);',
      '    async () => { await runtimeScratch?.close(); },\n  ]);\n' +
      '  for (const row of launches.values()) { row.absence = await observeOwnedProcessExit(row.identity);\n' +
      '    if (row.absence.status !== "owned-identity-absent") throw new Error("Helper cleanup unavailable"); }\n' +
      `  await writeFile(${JSON.stringify(path.join(directory, "helper-identities.json"))}, JSON.stringify({ launches: [...launches.values()], forbiddenRequests, profileRemoved: true, observerScratchRemoved: true, runtime: runtimeScratch?.directory ?? null }), { flag: "wx" });`],
  ].map(([before, after]) => [before.replaceAll("\n", eol), after.replaceAll("\n", eol)]);
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2, after); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source, "Every original conversion, validation, 250 MiB and repeat gate remains exact");
  // Only top-level module bindings, never generated-code literals.
  generated = generated.replace(/^(import[^\n]+from) "(\.\/lib\/[^"\n]+)";/gm,
    (_, prefix, relative) => `${prefix} ${JSON.stringify(uri("scripts/" + relative.slice(2)))};`);
  return { generated, edits, baseSha256: AIFF_STRESS_BASE_SHA,
    generatedSha256: createHash("sha256").update(generated).digest("hex") };
}
