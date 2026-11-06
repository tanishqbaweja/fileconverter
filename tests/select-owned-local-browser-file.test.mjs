import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { selectOwnedLocalBrowserFile } from "../scripts/lib/select-owned-local-browser-file.mjs";
function mockPage({ missing = false, fail = false, failDetach = false } = {}) {
  const commands = []; let detach = 0;
  const page = { context: () => ({ newCDPSession: async () => ({ async send(method, params) {
    commands.push({ method, params });
    if (method === "DOM.getDocument") return { root: { nodeId: 1 } };
    if (method === "DOM.querySelector") return { nodeId: missing ? 0 : 2 };
    assert.equal(method, "DOM.setFileInputFiles"); if (fail) throw new Error("Synthetic native chooser failure"); return {};
  }, async detach() { detach++; if (failDetach) throw new Error("Synthetic detach failure"); } }) }) };
  return { page, commands, get detached() { return detach; } };
}
test("owned local selector sends only actual absolute file path through native DOM API and closes its diagnostic session", async () => {
  const runtime = await createOwnedRuntimeScratch("local-file-selection-test-");
  try {
    const file = path.join(runtime.directory, "input with spaces.docx"); await writeFile(file, "small fixture");
    const mock = mockPage(), result = await selectOwnedLocalBrowserFile(mock.page, file, runtime.directory);
    assert.deepEqual(mock.commands.map(c => c.method), ["DOM.getDocument", "DOM.querySelector", "DOM.setFileInputFiles"]);
    assert.deepEqual(mock.commands.at(-1).params, { nodeId: 2, files: [file] }); assert.equal(mock.detached, 1);
    assert.equal(result.selectedFileBytes, 13); assert.equal(result.contentPayloadsSent, 0); assert.equal(result.nodeFileContentsRead, false);
    assert.equal((await readFile(file, "utf8")), "small fixture");
    const source = await readFile(new URL("../scripts/lib/select-owned-local-browser-file.mjs", import.meta.url), "utf8");
    assert.doesNotMatch(source, /(?:readFile|createReadStream|arrayBuffer|readFileSync|\.setInputFiles)\s*\(/);
  } finally { await runtime.close(); }
});
test("missing input/native selection failures release session and preserve primary error even if detach also fails", async () => {
  const runtime = await createOwnedRuntimeScratch("local-file-selection-test-");
  try {
    const file = path.join(runtime.directory, "input.docx"); await writeFile(file, "x");
    for (const options of [{ missing: true }, { fail: true, failDetach: true }]) {
      const mock = mockPage(options); await assert.rejects(selectOwnedLocalBrowserFile(mock.page, file, runtime.directory),
        options.missing ? /Actual production file input/ : /native chooser failure/); assert.equal(mock.detached, 1);
    }
  } finally { await runtime.close(); }
});
test("outside fixture directory or directory instead of file is refused before any browser command", async () => {
  const runtime = await createOwnedRuntimeScratch("local-file-selection-test-");
  try {
    const subdirectory = path.join(runtime.directory, "scope"); await mkdir(subdirectory);
    const file = path.join(runtime.directory, "outside.docx"); await writeFile(file, "x");
    const mock = mockPage(); await assert.rejects(selectOwnedLocalBrowserFile(mock.page, file, subdirectory), /caller.*owned fixture/);
    await assert.rejects(selectOwnedLocalBrowserFile(mock.page, subdirectory, runtime.directory)); assert.equal(mock.commands.length, 0);
  } finally { await runtime.close(); }
});
