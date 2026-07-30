import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workRoot = path.resolve(projectRoot, "work");
const outputsRoot = path.resolve(projectRoot, "outputs");
const disposableOutputRoot = path.resolve(projectRoot, "output");
const playwrightOutputRoot = path.resolve(disposableOutputRoot, "playwright");
const stressFixturesRoot = path.resolve(projectRoot, "fixtures", "stress");
const profileRoot = path.resolve(workRoot, "memory-profile-chrome");
const downloadedFfmpegArchive = path.resolve(workRoot, "ffmpeg-8.1.2.tar.xz");
const retainedOutputExtensions = new Set([".json", ".csv", ".html"]);
const generatedStressExtensions = new Set([".bin", ".gz", ".mkv"]);

assertInside(workRoot, profileRoot);
assertInside(workRoot, downloadedFfmpegArchive);
assertInside(disposableOutputRoot, playwrightOutputRoot);
await removeWithRetries(profileRoot);
await removeWithRetries(playwrightOutputRoot);
await rm(downloadedFfmpegArchive, { force: true });

for await (const entry of walkFiles(outputsRoot)) {
  if (
    entry.name !== ".gitkeep" &&
    !retainedOutputExtensions.has(path.extname(entry.name).toLowerCase())
  ) {
    assertInside(outputsRoot, entry.fullPath);
    await rm(entry.fullPath, { force: true });
  }
}

for await (const entry of walkFiles(stressFixturesRoot)) {
  if (generatedStressExtensions.has(path.extname(entry.name).toLowerCase())) {
    assertInside(stressFixturesRoot, entry.fullPath);
    await rm(entry.fullPath, { force: true });
  }
}

process.stdout.write("Generated profile and disposable output cleanup complete.\n");

function assertInside(parent, child) {
  const relative = path.relative(parent, child);
  if (
    relative === "" ||
    relative.startsWith("..") ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Unsafe cleanup target: ${child}`);
  }
}

async function* walkFiles(directory) {
  try {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        yield* walkFiles(fullPath);
      } else if (entry.isFile()) {
        yield { name: entry.name, fullPath };
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function removeWithRetries(target) {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    try {
      await stat(target);
      await rm(target, { recursive: true, force: true, maxRetries: 2 });
      return;
    } catch (error) {
      if (error?.code === "ENOENT") return;
      if (
        !["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code) ||
        attempt === 12
      ) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
