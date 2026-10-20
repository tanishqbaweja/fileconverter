// Explicit portable/qualification selection, with no skip patterns or softened assertions.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { once } from "node:events";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadUnitSuitePlan } from "./lib/unit-suite-contract.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";

const root = path.resolve(import.meta.dirname, ".."), args = process.argv.slice(2), mode = args.shift() ?? "portable";
assert.ok(["portable", "qualification", "all"].includes(mode), "Choose portable, qualification or all");
assert.ok(args.length <= 1 && args.every(arg => arg === "--list" || arg.startsWith("--reporter=file:")), "Unsupported unit-suite option");
const plan = await loadUnitSuitePlan(root), files = plan[mode];
console.log(JSON.stringify({ suite: mode, selectedFiles: files.length, allFiles: plan.all.length,
  portableFiles: plan.portable.length, qualificationFiles: plan.qualification.length,
  priorHostedFilesKeptPortable: plan.protectedPriorHostedFiles,
  qualificationStatus: "separate-prerequisite-bound-checks-not-implied-passed", publicAcceptance: false }));
if (args[0] === "--list") { console.log(JSON.stringify({ files, prerequisites: mode === "portable" ? undefined : plan.prerequisites })); }
else {
  const runtime = await createOwnedRuntimeScratch("unit-suite-");
  const previous = Object.fromEntries(Object.keys(runtime.env).map(key => [key, process.env[key]]));
  previous.NODE_OPTIONS = process.env.NODE_OPTIONS; previous.NODE_TEST_CONTEXT = process.env.NODE_TEST_CONTEXT;
  const preload = pathToFileURL(path.join(root, "scripts/lib/hidden-unit-subprocesses.mjs")).href;
  Object.assign(process.env, runtime.env);
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS ?? "", "--import=" + preload].filter(Boolean).join(" ");
  delete process.env.NODE_TEST_CONTEXT;
  try {
    // Import after the headless preload so Node's internal spawn binding is hidden too.
    const { run } = await import("node:test");
    const events = run({ files: files.map(file => path.join(root,file)), concurrency: 2,
      execArgv: ["--import", preload] });
    events.on("test:fail", () => { process.exitCode = 1; });
    const custom = args[0]?.slice("--reporter=".length);
    const reporter = custom ? (await import(custom)).default : terminalReport;
    for await (const chunk of reporter(events)) if (!process.stdout.write(chunk)) await once(process.stdout, "drain");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    await runtime.close();
  }
}
async function* terminalReport(events) {
  for await (const event of events) {
    if (event.type === "test:fail") yield JSON.stringify({ failed: event.data.name, file: event.data.file,
      message: String(event.data.details?.error?.cause?.message ?? event.data.details?.error?.message ?? "Failed").slice(0,2048) }) + "\n";
    if (event.type === "test:summary" && !event.data.file) yield JSON.stringify({ summary: event.data,
      qualificationNotRun: mode === "portable", suite: mode }) + "\n";
  }
}
