// Run the actual committed default unit selection without untracked work or original media.
// Dependencies are reused from the ancestor checkout; this is not npm-ci evidence.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, realpath, lstat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { boundedTail } from "./lib/bounded-supervisor-journal.mjs";

const root = path.resolve(import.meta.dirname, ".."), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const output = path.join(root, "outputs", "reports", stamp + "-clean-checkout-unit.json");
const runtime = await createOwnedRuntimeScratch("clean-checkout-unit-");
const checkout = path.join(runtime.directory, "checkout"), commands = [];
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
let registered = false, failure = null, report = null;
async function run(executable, args, cwd) {
  const stdout = boundedTail(), stderr = boundedTail();
  const environment = { ...runtime.env, WITHIN_UNIT_INVENTORY_REPORT: output,
    WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
  delete environment.NODE_TEST_CONTEXT;
  const child = spawn(executable, args, { cwd, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.on("data", chunk => stdout.append(chunk)); child.stderr.on("data", chunk => stderr.append(chunk));
  const exit = await new Promise((resolve,reject) => { child.once("error",reject); child.once("close",(code,signal) => resolve({ code,signal })); });
  const record = { executable, args, cwd, windowsHide: true, exit,
    stdout: stdout.snapshot(), stderr: stderr.snapshot() };
  commands.push(record); return record;
}
try {
  const added = await run("git", ["worktree", "add", "--detach", checkout, "HEAD"], root);
  assert.equal(added.exit.code, 0, Buffer.from(added.stderr.tailBase64,"base64").toString()); registered = true;
  const commit = await run("git", ["rev-parse", "HEAD"], checkout); assert.equal(commit.exit.code, 0);
  const packageBytes = await readFile(path.join(checkout, "package.json")), packageJson = JSON.parse(packageBytes);
  const unitCommand = packageJson.scripts["test:unit"];
  assert.ok(["node --test tests/*.test.mjs", "node scripts/run-unit-suite.mjs portable"].includes(unitCommand));
  console.log(JSON.stringify({ stage: "clean-committed-checkout-created", checkout, commit: Buffer.from(commit.stdout.tailBase64,"base64").toString().trim() }));
  const build = await run(process.execPath, [path.join(root,"node_modules/vinext/dist/cli.js"), "build"], checkout);
  assert.equal(build.exit.code, 0, Buffer.from(build.stderr.tailBase64,"base64").toString());
  console.log(JSON.stringify({ stage: "production-build-passed-running-committed-default-unit-command", unitCommand, concurrency: 2 }));
  const reporter = "--test-reporter=" + pathToFileURL(path.join(root,"scripts/lib/unit-inventory-reporter.mjs")).href;
  const tested = await run(process.execPath, unitCommand === "node --test tests/*.test.mjs" ?
    ["--test", "--test-concurrency=2", reporter, "tests/*.test.mjs"] :
    ["scripts/run-unit-suite.mjs", "portable", reporter.replace("--test-reporter=", "--reporter=")], checkout);
  const unit = JSON.parse(await readFile(output));
  assert.equal(unit.allEventsConsumed, true);
  report = { recordedAt: new Date().toISOString(), commit: Buffer.from(commit.stdout.tailBase64,"base64").toString().trim(),
    committedPackageSha256: sha(packageBytes), defaultUnitCommandUnchanged: true, unitCommand,
    actualTrackedCheckoutWithoutUntrackedWorkOrTestMkv: true, dependenciesReusedFromAncestor: true,
    npmCiOrHostedLinuxResult: false, productionBuildPassed: true, unitExit: tested.exit,
    inventory: { path: path.relative(root,output).replaceAll("\\","/"), sha256: sha(await readFile(output)) },
    failingFiles: unit.files.filter(row => row.failed), skippedCases: unit.files.reduce((sum,row) => sum + row.skipped,0),
    summary: unit.summaries.at(-1), commands, checkoutRemoved: false, runtimeRemoved: false,
    publicAcceptance: false, fullProjectAcceptance: false };
} catch (error) { failure = { name: error.name, message: String(error.message).slice(0, 4096), code: error.code ?? null }; }
finally {
  if (registered) {
    assert.equal(path.dirname(checkout), runtime.directory);
    assert.equal(await realpath(checkout), checkout);
    assert.equal((await lstat(path.join(checkout,".git"))).isFile(), true);
    const removed = await run("git", ["worktree", "remove", "--force", checkout], root);
    assert.equal(removed.exit.code,0,Buffer.from(removed.stderr.tailBase64,"base64").toString());
    await assert.rejects(lstat(checkout), { code:"ENOENT" });
    if (report) report.checkoutRemoved = true;
  }
  await runtime.close();
  if (report) report.runtimeRemoved = true;
}
if (failure) {
  const receipt = path.join(root,"evidence",stamp+"-clean-checkout-unit-probe-failure.json");
  await writeFile(receipt,JSON.stringify({failure,commands,ownedRuntimeRemoved:true},null,2)+"\n",{flag:"wx"});
  console.error(JSON.stringify({ failure,receipt,lastCommandError:Buffer.from(commands.at(-2)?.stderr.tailBase64??"","base64").toString().slice(-4096) })); process.exitCode=1;
}
else {
  const receipt = path.join(root,"evidence", stamp + "-clean-checkout-unit-probe.json");
  await writeFile(receipt,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({ receipt, failingFiles:report.failingFiles.length, unitExit:report.unitExit, summary:report.summary, checkoutRemoved:report.checkoutRemoved, runtimeRemoved:report.runtimeRemoved }));
}
