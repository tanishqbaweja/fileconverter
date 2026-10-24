// Qualification-only OS proof. An OPFS API success alone does NOT prove disk
// backing: Chromium incognito uses ObfuscatedFileUtilMemoryDelegate.
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { lstat, open, readdir, realpath } from "node:fs/promises";
import path from "node:path";
const workspace = path.resolve(import.meta.dirname, "../.."), work = path.join(workspace, "work");
export async function verifyOpfsDiskBacking(page, profileDirectory) {
  profileDirectory = path.resolve(profileDirectory);
  const relative = path.relative(work, profileDirectory);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(await realpath(profileDirectory), profileDirectory);
  assert.equal((await lstat(profileDirectory)).isSymbolicLink(), false);
  const name = "within-disk-proof-" + randomUUID(), nonce = randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", "");
  const payload = Buffer.from(nonce); assert.equal(payload.length, 64);
  let requested = false, visited = 0, matchingFile = null, browserBytes = null;
  try {
    requested = true;
    browserBytes = await page.evaluate(async ({ name, nonce }) => {
      const root = await navigator.storage.getDirectory(), handle = await root.getFileHandle(name, { create: true });
      const writer = await handle.createWritable();
      try { await writer.write(nonce); await writer.close(); }
      catch (error) { await writer.abort().catch(() => {}); throw error; }
      return (await handle.getFile()).size;
    }, { name, nonce });
    assert.equal(browserBytes, 64);
    const scan = async (directory, depth = 0) => {
      assert.ok(depth <= 10, "Owned storage proof depth exceeded");
      const entries = await readdir(directory, { withFileTypes: true }).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const entry of entries) {
        assert.ok(++visited <= 4096, "Owned storage proof entry bound exceeded");
        assert.equal(entry.isSymbolicLink(), false, "Owned profile storage must not redirect");
        const file = path.join(directory, entry.name);
        if (entry.isDirectory()) { await scan(file, depth + 1); if (matchingFile) return; }
        else if (entry.isFile() && (await lstat(file)).size === payload.length) {
          const handle = await open(file, "r");
          try {
            const buffer = Buffer.alloc(65), { bytesRead } = await handle.read(buffer, 0, 65, 0);
            if (bytesRead === 64 && buffer.subarray(0, bytesRead).equals(payload)) { matchingFile = file; return; }
          } finally { await handle.close(); }
        }
      }
    };
    // Only owned OPFS backing roots, never browser cookies/history or input.
    for (const directory of ["File System", "WebStorage"]) {
      await scan(path.join(profileDirectory, "Default", directory)); if (matchingFile) break;
    }
    assert.ok(matchingFile, "OPFS canary was not found on disk; do not assume API success is disk-backed storage");
    return { status: "exact-browser-canary-independently-found-on-disk", browserBytes, physicalBytes: payload.length,
      sha256: createHash("sha256").update(payload).digest("hex"), physicalFile: path.relative(workspace, matchingFile),
      profileDirectory: path.relative(workspace, profileDirectory), inspectedEntries: visited, maximumReadBytes: 65,
      provesThisContextOpfsBacking: true, provesConversionAcceptance: false, canaryRemovedInFinally: true };
  } finally {
    if (requested) await page.evaluate(async name => {
      const root = await navigator.storage.getDirectory();
      try { await root.removeEntry(name); } catch (error) { if (error.name !== "NotFoundError") throw error; }
    }, name);
  }
}
