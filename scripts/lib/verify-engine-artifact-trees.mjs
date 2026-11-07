// Independent, read-only comparison of complete artifact trees to Git blobs.
// It cannot attest that an arbitrary supplied output was compiled from source.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
const execute = promisify(execFile), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const MAX_ENTRIES = 256, MAX_FILE = 64 * 1048576, MAX_TOTAL = 256 * 1048576;
const normalized = value => process.platform === "win32" ? value.toLowerCase() : value;
function parts(relative) {
  const values = relative.split("/");
  assert.ok(values.length <= 10 && values.every(p => /^[A-Za-z0-9_.-]{1,128}$/.test(p) && p !== "." && p !== ".."), "Safe portable artifact path required");
  return values;
}
async function directoryInside(root, relative) {
  let current = root;
  for (const p of parts(relative)) {
    current = path.join(current, p); const info = await lstat(current);
    assert.ok(info.isDirectory() && !info.isSymbolicLink(), "Artifact directory cannot redirect or be a link: " + relative);
    assert.equal(normalized(await realpath(current)), normalized(current), "Artifact directory redirected: " + relative);
  }
  return current;
}
async function hashStream(stream, expectedBytes) {
  const h = createHash("sha256"); let bytes = 0;
  for await (const chunk of stream) { bytes += chunk.length; assert.ok(bytes <= expectedBytes, "Artifact grew while reading"); h.update(chunk); }
  assert.equal(bytes, expectedBytes); return h.digest("hex");
}
async function blobHash(git, root, object, bytes, env) {
  const child = spawn(git, ["cat-file", "blob", object], { cwd: root, env, windowsHide: true, timeout: 15000, stdio: ["ignore", "pipe", "ignore"] });
  const exited = new Promise((resolve, reject) => {
    child.once("error", reject); child.once("close", code => code === 0 ? resolve() : reject(new Error("Git blob read failed: " + object)));
  });
  const [digest] = await Promise.all([hashStream(child.stdout, bytes), exited]); return digest;
}
async function committedFiles(root, commit, output, git, env) {
  const command = async args => (await execute(git, args, { cwd: root, env, windowsHide: true, timeout: 15000, maxBuffer: 131072 })).stdout;
  assert.match(commit, /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/); assert.equal((await command(["rev-parse", "HEAD"])).trim(), commit, "Expected commit is not checked out HEAD");
  const rows = (await command(["ls-tree", "-r", "--long", "-z", commit, "--", output])).split("\0").filter(Boolean);
  assert.ok(rows.length > 0 && rows.length <= MAX_ENTRIES, "Finite nonempty committed artifact tree required");
  const files = new Map(), folded = new Set(); let total = 0;
  for (const row of rows) {
    const match = /^100644 blob ([0-9a-f]+)\s+(\d+)\t(.+)$/.exec(row);
    assert.ok(match && match[1].length === commit.length && match[3].startsWith(output + "/"), "Expected only committed regular engine artifacts");
    const name = match[3].slice(output.length + 1), bytes = Number(match[2]); parts(name);
    assert.ok(!folded.has(name.toLowerCase()), "Duplicate or case-colliding artifact path"); folded.add(name.toLowerCase());
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_FILE); total += bytes; assert.ok(total <= MAX_TOTAL);
    files.set(name, { path: name, bytes, sha256: await blobHash(git, root, match[1], bytes, env) });
  }
  assert.ok([...files.keys()].some(name => name.endsWith(".wasm")), "No Wasm in declared engine tree");
  return { files, total };
}
async function verifyDirectory(root, relative, expected) {
  const directory = await directoryInside(root, relative), directories = new Set(), seen = new Set(); let count = 0;
  for (const name of expected.keys()) {
    const components = parts(name);
    for (let i = 1; i < components.length; i++) directories.add(components.slice(0, i).join("/"));
  }
  async function walk(full, prefix = "") {
    for await (const entry of await opendir(full)) {
      assert.ok(++count <= MAX_ENTRIES, "Artifact directory entry cap");
      const name = prefix + entry.name; parts(name);
      const file = path.join(full, entry.name), before = await lstat(file, { bigint: true });
      assert.equal(before.isSymbolicLink(), false, "Artifact link refused: " + name);
      assert.equal(normalized(await realpath(file)), normalized(file), "Artifact redirected: " + name);
      if (before.isDirectory()) { assert.ok(directories.has(name), "Unexpected artifact directory: " + name); await walk(file, name + "/"); continue; }
      const row = expected.get(name); assert.ok(row && before.isFile(), "Unexpected/nonregular artifact: " + name);
      assert.equal(before.size, BigInt(row.bytes), "Artifact size differs from commit: " + name);
      assert.equal(await hashStream(createReadStream(file, { highWaterMark: 262144 }), row.bytes), row.sha256, "Artifact SHA-256 differs from commit: " + name);
      const after = await lstat(file, { bigint: true });
      for (const key of ["dev", "ino", "size", "mtimeNs", "ctimeNs"]) assert.equal(after[key], before[key], "Artifact identity changed while hashing: " + name);
      seen.add(name);
    }
  }
  await walk(directory);
  assert.deepEqual([...seen].sort(), [...expected.keys()].sort(), "Missing artifact files");
}
export async function verifyEngineArtifactTrees({ root, expectedCommit, engine, rebuiltDirectory = null, git = process.env.WITHIN_GIT_EXECUTABLE ?? "git" }) {
  root = path.resolve(root); assert.equal(normalized(await realpath(root)), normalized(root));
  assert.match(engine.output, /^public\/engines\/[a-z0-9-]+$/); assert.match(engine.id, /^[a-z0-9-]+$/);
  assert.ok(["native-source", "pinned-package-copy"].includes(engine.reproductionKind));
  if (rebuiltDirectory !== null) { parts(rebuiltDirectory); assert.match(rebuiltDirectory, /^work\/.+/, "Rebuild evidence must use a separate repository work tree"); }
  const env = { ...process.env, GIT_NO_REPLACE_OBJECTS: "1" };
  const { files, total } = await committedFiles(root, expectedCommit, engine.output, git, env);
  await verifyDirectory(root, engine.output, files);
  if (rebuiltDirectory !== null) await verifyDirectory(root, rebuiltDirectory, files);
  const ordered = [...files.keys()].sort().map(name => files.get(name));
  return { engine: engine.id, expectedCommit, reproductionKind: engine.reproductionKind, publishedDirectory: engine.output,
    rebuiltDirectory, files: ordered.length, wasmFiles: ordered.filter(r => r.path.endsWith(".wasm")).length, bytes: total,
    treeSha256: sha(JSON.stringify(ordered)), publishedTreeMatchesCommit: true, rebuiltTreeMatchesCommit: rebuiltDirectory !== null,
    sourceCompilationProvenByComparator: false, dockerUsed: false };
}
