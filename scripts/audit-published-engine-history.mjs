// Read-only engine/source-artifact inventory. Never calls any build or converter.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, ".."), git = process.env.WITHIN_GIT_EXECUTABLE ?? "git";
assert.equal(process.argv.length, 2, "No alternate roots, output destinations or history supplied by this inventory");
const execute = args => execFileSync(git, args, { cwd: root, windowsHide: true, timeout: 30000, maxBuffer: 2097152, encoding: "utf8" });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const digest = async file => { const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 262144 })) hash.update(chunk);
  return hash.digest("hex"); };
const matrix = JSON.parse(execFileSync(process.execPath, ["scripts/engine-reproducibility-manifest.mjs", "--non-docker"],
  { cwd: root, windowsHide: true, timeout: 10000, maxBuffer: 131072, encoding: "utf8" })).include;
const sourceHead = execute(["rev-parse", "HEAD"]).trim();
assert.equal(execute(["status", "--porcelain=v1", "--untracked-files=all", "--", "public/engines"]).trim(), "", "Published engines must be unchanged");
const snapshots = { original: "5e46a6611865cc0c20400e34899c6c1da7861954",
  direct: "c3a525a9e926fdeab20096dc0501ce3ad339d6f5", inspector: "c0c09a17813fd79fa1ffee21bb71f2ecc6beaab5" };
const tree = (revision, output) => execute(["ls-tree", "-r", "-z", "--long", revision, "--", output]).split("\0").filter(Boolean).map(line => {
  const [metadata, file] = line.split("\t"), match = metadata.match(/^(\d+) blob ([a-f0-9]{40})\s+(\d+)$/);
  assert.ok(match, `Only regular published blob artifacts: ${file}`); assert.equal(match[1], "100644");
  return { path: file, gitBlob: match[2], bytes: Number(match[3]) };
});
const walk = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false, "Published paths must not redirect");
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(file));
    else { assert.ok(entry.isFile()); files.push(path.relative(root, file).replaceAll("\\", "/")); }
  }
  return files.sort();
};
const report = { schemaVersion: 1, observedAt: new Date().toISOString(), sourceHead,
  scope: "Current published artifact identity against retained successful historical snapshots; not fresh source rebuild or final release acceptance",
  dockerUsed: false, browserLaunched: false, conversionRun: false, protectedTestMkvRead: false,
  driverSha256: sha(await readFile(import.meta.filename)),
  manifestSha256: sha(await readFile(path.join(root, "scripts/engine-reproducibility-manifest.mjs"))),
  snapshots, engines: [], allPublishedEnginesSourceRebuilt: false, originalGoalComplete: false };
for (const engine of matrix) {
  const historicalCommit = engine.id === "jxl-inspector" ? snapshots.inspector : engine.id === "ffmpeg-remux" ? snapshots.direct : snapshots.original;
  const baseline = new Map(tree(historicalCommit, engine.output).map(file => [file.path, file]));
  const files = tree(sourceHead, engine.output);
  assert.deepEqual(await walk(path.join(root, engine.output)), files.map(file => file.path).sort());
  for (const file of files) {
    const absolute = path.join(root, file.path), info = await lstat(absolute);
    assert.ok(info.isFile() && !info.isSymbolicLink()); assert.equal(info.size, file.bytes);
    // SHA256 binds actual current disk bytes; git hash-object also checks tracked identity.
    file.sha256 = await digest(absolute); assert.equal(execute(["hash-object", "--", file.path]).trim(), file.gitBlob);
    file.historicalGitBlob = baseline.get(file.path)?.gitBlob ?? null;
    file.sameHistoricalBytes = file.historicalGitBlob === file.gitBlob;
    baseline.delete(file.path);
  }
  report.engines.push({ id: engine.id, reproductionKind: engine.reproductionKind, output: engine.output, historicalCommit,
    files, removedHistoricalFiles: [...baseline.keys()], unchanged: files.every(file => file.sameHistoricalBytes) && baseline.size === 0 });
}
assert.equal(report.engines.length, 12);
report.summary = { publishedDirectories: report.engines.length,
  nativeSourceRecipes: report.engines.filter(engine => engine.reproductionKind === "native-source").length,
  pinnedPackageCopies: report.engines.filter(engine => engine.reproductionKind === "pinned-package-copy").map(engine => engine.id),
  whollyUnchangedHistoricalDirectories: report.engines.filter(engine => engine.unchanged).length,
  changedFiles: report.engines.flatMap(engine => engine.files.filter(file => !file.sameHistoricalBytes).map(file => file.path)) };
assert.equal(execute(["status", "--porcelain=v1", "--untracked-files=all", "--", "public/engines"]).trim(), "");
assert.equal(report.driverSha256, sha(await readFile(import.meta.filename)));
assert.equal(report.manifestSha256, sha(await readFile(path.join(root, "scripts/engine-reproducibility-manifest.mjs"))));
const file = path.join(root, "evidence", new Date().toISOString().replaceAll(/[:.]/g, "-") + "-published-engine-history.json");
await writeFile(file, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ path: path.relative(root, file), summary: report.summary }));
