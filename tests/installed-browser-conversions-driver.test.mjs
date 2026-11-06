import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
const execute = promisify(execFile), file = new URL("../scripts/run-installed-browser-conversions.mjs", import.meta.url);
test("installed conversion driver retains unchanged real production matrix, headless-only selection and explicit non-acceptance scope", async () => {
  const source = await readFile(file, "utf8");
  for (const anchor of ["Object.hasOwn(targets, id)", 'WITHIN_CROSS_BROWSER_HEADED: "0"', 'WITHIN_OPERA_GX_HEADED: "0"',
    "headless:true", "windowsHide: true", "NODE_OPTIONS:", "scripts/lib/hidden-unit-subprocesses.mjs",
    "conversionMemoryAcceptance: false", "osNativePickerVerified: false", "stressAcceptance: false", "publicPromotion: false",
    "browser-compatibility.spec.ts", "result.stats.expected, 1", "result.stats.unexpected, 0", "result.stats.skipped, 0", "result.stats.flaky, 0",
    '"csv-to-tsv", "mkv-to-mp4", "png-to-webp", "tar-to-zip", "txt-to-docx"', "browserLaunchPolicy"])
    assert.ok(source.includes(anchor), anchor);
  assert.doesNotMatch(source, /--headed|--grep|--disable-|\.replace\(/);
});
test("driver refuses pre-existing fixed paths, protects original, independently closes owned roots and removes runtime in finally", async () => {
  const source = await readFile(file, "utf8");
  for (const anchor of ["assert.rejects(access(file)", "assert.deepEqual(await profiles(), [])", "2958573265",
    "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34", "finally {", "finishOwnedCleanup([",
    "queryReliableProcessIdentity(runner.pid), runnerBirth", "server.close()", "owned-identity-absent", "await runtime.close()",
    "await inspectBinary(); assert.deepEqual(report.browserAfter, report.browserBefore)", "report.protectedOriginalAfter, report.protectedOriginalBefore",
    "allowed.has(name)", 'flag: "wx"', "report.failureArtifacts", "await cp("])
    assert.ok(source.includes(anchor), anchor);
});
test("invalid target fails before any browser/server or temporary data creation", async () => {
  await assert.rejects(execute(process.execPath, [fileURLToPath(file), "unknown-target"],
    { windowsHide: true, timeout: 10000, maxBuffer: 16384 }), error => {
      assert.equal(error.code, 1); assert.match(error.stderr, /Select one installed browser explicitly|win32/); return true;
    });
});
