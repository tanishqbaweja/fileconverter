// CDP-connected Playwright otherwise treats the browser as remote and uploads a
// complete buffer/base64 payload. This adapter sends ONLY an owned local path to
// Chromium's real file input. It changes no production File/worker/I/O pipeline.
import assert from "node:assert/strict";
import { lstat, realpath } from "node:fs/promises";
import path from "node:path";
const canonical = value => process.platform === "win32" ? value.toLowerCase() : value;
const identity = info => [info.dev, info.ino, info.size, info.birthtimeNs, info.mtimeNs].map(String);
export async function selectOwnedLocalBrowserFile(page, file, ownedDirectory) {
  file = path.resolve(file); ownedDirectory = path.resolve(ownedDirectory);
  const work = path.resolve(import.meta.dirname, "../../work"), parent = path.relative(work, ownedDirectory);
  assert.ok(parent && !parent.startsWith("..") && !path.isAbsolute(parent), "Fixture directory must be a repository-owned work child");
  const relative = path.relative(ownedDirectory, file);
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative), "Select only a file inside the caller's owned fixture directory");
  const directory = await lstat(ownedDirectory);
  assert.ok(directory.isDirectory() && !directory.isSymbolicLink());
  assert.equal(canonical(await realpath(ownedDirectory)), canonical(ownedDirectory));
  const before = await lstat(file, { bigint: true }); assert.ok(before.isFile() && !before.isSymbolicLink());
  assert.equal(canonical(await realpath(file)), canonical(file));
  let session, primaryFailure = false;
  try {
    session = await page.context().newCDPSession(page);
    const { root } = await session.send("DOM.getDocument", { depth: 0 });
    const { nodeId } = await session.send("DOM.querySelector", { nodeId: root.nodeId, selector: '[data-testid="file-input"]' });
    assert.ok(Number.isSafeInteger(nodeId) && nodeId > 0, "Actual production file input required");
    await session.send("DOM.setFileInputFiles", { nodeId, files: [file] });
    assert.deepEqual(identity(await lstat(file, { bigint: true })), identity(before), "Fixture changed during native file selection");
    return { method: "DOM.setFileInputFiles", selectedLocalPathCount: 1, selectedFileBytes: Number(before.size),
      contentPayloadsSent: 0, nodeFileContentsRead: false, productionInputElementUsed: true, fileMetadataUnchanged: true };
  } catch (error) { primaryFailure = true; throw error; }
  finally {
    try { await session?.detach(); }
    catch (error) { if (!primaryFailure) throw error; }
  }
}
