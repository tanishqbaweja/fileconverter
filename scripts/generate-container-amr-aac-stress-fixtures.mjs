import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const retainedPaths = [
  "fixtures/media/theora-video-source.ogv",
  "fixtures/media/theora-video-source.ogv.json",
  "fixtures/stress/media/theora-video-128m.ogv.json",
].map((relativePath) => path.join(projectRoot, relativePath));
const retainedFiles = new Map(
  await Promise.all(
    retainedPaths.map(async (filePath) => [filePath, await readFile(filePath)]),
  ),
);
const containerNames = [
  "h264-aac-flac-128m.mp4",
  "h264-aac-flac-128m.mov",
  "h264-aac-flac-128m.mkv",
  "h264-aac-flac-128m.mpegts",
  "h264-aac-flac-128m.flv",
];
const aviName = "mpeg4-mp3-webm-128m.avi";
const ogvName = "theora-video-128m.ogv";
const availableNames = new Set([...containerNames, aviName, ogvName]);
const requestedNames = process.argv.slice(2);
for (const requestedName of requestedNames) {
  if (!availableNames.has(requestedName)) {
    throw new Error(
      `Unknown container AMR/AAC fixture ${requestedName}. Choose from: ${[...availableNames].join(", ")}.`,
    );
  }
}
const selectedNames = requestedNames.length === 0
  ? availableNames
  : new Set(requestedNames);
const selectedContainerNames = containerNames.filter((name) => selectedNames.has(name));

try {
  const generators = [];
  if (selectedContainerNames.length > 0) {
    generators.push(
      runGenerator("scripts/generate-container-flac-stress-fixtures.mjs", selectedContainerNames),
    );
  }
  if (selectedNames.has(aviName)) {
    generators.push(runGenerator("scripts/generate-avi-webm-stress-fixture.mjs"));
  }
  if (selectedNames.has(ogvName)) {
    generators.push(runGenerator("scripts/generate-ogv-stress-fixture.mjs"));
  }
  const results = await Promise.all(generators);
  for (const stdout of results) process.stdout.write(stdout);
} finally {
  await Promise.all(
    [...retainedFiles].map(([filePath, contents]) => writeFile(filePath, contents)),
  );
}

async function runGenerator(script, arguments_ = []) {
  const { stdout } = await execFileAsync(process.execPath, [script, ...arguments_], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}
