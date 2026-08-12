import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const jobs = [
  {
    script: "scripts/generate-audio-stress-fixture.mjs",
    outputs: ["audio-aac-50m.m4a", "audio-pcm-192m.aiff"],
    selectable: true,
  },
  {
    script: "scripts/generate-aac-stress-fixture.mjs",
    outputs: ["audio-aac-128m.aac"],
    selectable: false,
  },
  {
    script: "scripts/generate-alac-stress-fixture.mjs",
    outputs: [
      "audio-alac-128m.m4a",
      "audio-flac-alac-128m.flac",
      "audio-pcm-alac-128m.wav",
    ],
    selectable: true,
  },
  {
    script: "scripts/generate-wma-stress-fixture.mjs",
    outputs: ["audio-wma-128m.wma"],
    selectable: true,
  },
  {
    script: "scripts/generate-amr-stress-fixture.mjs",
    outputs: ["audio-amr-nb-128m.amr"],
    selectable: false,
  },
  {
    script: "scripts/generate-flac-input-stress-fixtures.mjs",
    outputs: ["audio-vorbis-flac-128m.ogg", "audio-opus-flac-128m.opus"],
    selectable: true,
  },
];

const requestedNames = new Set(process.argv.slice(2));
const knownNames = new Set(jobs.flatMap((job) => job.outputs));
for (const name of requestedNames) {
  if (!knownNames.has(name)) {
    throw new Error(`Unknown fixture name: ${name}.`);
  }
}
const selectedJobs = jobs
  .map((job) => ({
    ...job,
    selectedOutputs: requestedNames.size
      ? job.outputs.filter((name) => requestedNames.has(name))
      : job.outputs,
  }))
  .filter((job) => job.selectedOutputs.length > 0);

const results = await Promise.all(
  selectedJobs.map((job) =>
    execFileAsync(process.execPath, [
      job.script,
      ...(job.selectable ? job.selectedOutputs : []),
    ], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  ),
);

for (const result of results) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}
