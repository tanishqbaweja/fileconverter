// Read-only independent source inspection. Native tools never convert media.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { openAsBlob } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { inspectMediaSource } from "../lib/media-source-inspection.ts";

const root = path.resolve(import.meta.dirname, "..");
const protectedInput = process.argv[2] === "--protected";
assert.equal(process.argv.length, protectedInput ? 3 : 2);
const baselineCommit = "20f1dc8e924c231019987aa2b5dbcab4417c7c99";
const baselineSha256 = "d51fea54af6b29cc26ffc2887b39ec95c4cdd8768f6a56416ba9920e0df698ec";
const prior = execFileSync("git", ["show", `${baselineCommit}:lib/media-source-inspection.ts`],
  { cwd: root, windowsHide: true, timeout: 5000, maxBuffer: 262144 });
assert.equal(createHash("sha256").update(prior).digest("hex"), baselineSha256);
const code = stripTypeScriptTypes(prior.toString("utf8"));
const { inspectMediaSource: baseline } = await import("data:text/javascript;base64," + Buffer.from(code).toString("base64"));
const ffprobe = process.env.WITHIN_FFPROBE_EXECUTABLE ?? "ffprobe";
const native = args => execFileSync(ffprobe, args, { cwd: root, windowsHide: true, timeout: 20000, maxBuffer: 65536, encoding: "utf8" });
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const files = ["fixtures/media/complex-remux-source.mkv", "fixtures/media/webm-source.webm", ...(protectedInput ? ["test.mkv"] : [])];
const results = [];
for (const relative of files) {
  const file = path.join(root, relative), source = await openAsBlob(file);
  const scans = [];
  for (const inspect of [baseline, inspectMediaSource]) {
    const ranges = [];
    const { inspectedBytes, metadataSignals, ...other } = await inspect({ size: source.size, slice(start, end) {
      ranges.push([start, end]); return source.slice(start, end);
    } }, relative.endsWith(".webm") ? "webm" : "mkv");
    assert.equal(inspectedBytes, ranges.reduce((total, [start, end]) => total + end - start, 0));
    assert.ok(inspectedBytes <= 65536);
    scans.push({ inspectedBytes, metadataSignals, ranges, other });
  }
  assert.deepEqual(scans[1].other, scans[0].other, "Non-metadata source disclosure must not change");
  assert.ok(scans[0].metadataSignals.every(signal => scans[1].metadataSignals.includes(signal)));
  const independent = JSON.parse(native(["-v", "error", "-show_chapters", "-show_entries",
    "stream=codec_type:stream_disposition=attached_pic:chapter=id:format_tags", "-of", "json", file]));
  const verified = { chapters: independent.chapters?.length ?? 0,
    tags: Object.keys(independent.format?.tags ?? {}).length,
    attachments: independent.streams.filter(stream => stream.codec_type === "attachment" || stream.disposition?.attached_pic === 1).length };
  const indexed = scans[1].metadataSignals.filter(signal => signal.startsWith("Indexed "));
  for (const label of indexed) assert.ok(verified[label.split(" ")[1]] > 0, "An independently readable metadata type is required");
  if (relative === "test.mkv") {
    assert.equal(source.size, 2958573265);
    assert.deepEqual(verified, { chapters: 0, tags: 4, attachments: 1 });
    assert.deepEqual(new Set(indexed), new Set(["Indexed attachments header", "Indexed tags header"]));
    assert.ok(scans[1].ranges.slice(2).every(([start, end]) => start > 2 ** 31 && end - start <= 8));
  } else assert.equal(scans[1].inspectedBytes, 4096);
  const [before, after] = scans.map(({ other, ...scan }) => ({ ...scan, unchangedFactsSha256: sha(JSON.stringify(other)) }));
  results.push({ relative, sourceBytes: source.size, native: verified, before, after });
}
console.log(JSON.stringify({ baselineCommit, baselineSha256, nativeTool: native(["-version"]).split(/\r?\n/)[0],
  results, browserLaunched: false, mediaConverted: false, outputFilesCreated: 0 }, null, 2));
