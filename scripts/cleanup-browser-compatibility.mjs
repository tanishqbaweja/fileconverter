import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = await realpath(path.resolve(import.meta.dirname, ".."));
const testOutputs = [
  {
    relative: "output/playwright/browser-compatibility",
    allowedNames: new Set([
      "brave-headed-complete.png",
      "brave.json",
      "chrome-headed-complete.png",
      "chrome.json",
      "edge-headed-complete.png",
      "edge.json",
      "opera-gx-headless-complete.png",
      "opera-gx.json",
    ]),
  },
  {
    relative: "output/playwright/artifacts",
    allowedNames: new Set([".last-run.json"]),
  },
  {
    relative: "output/playwright/report",
    allowedNames: new Set(["index.html"]),
  },
  { relative: "work/temp-compatibility" },
];

const targets = [];
for (const { relative, allowedNames } of testOutputs) {
  const absolute = path.resolve(projectRoot, relative);
  const backToRoot = path.relative(projectRoot, absolute);
  if (
    !backToRoot ||
    backToRoot.startsWith("..") ||
    path.isAbsolute(backToRoot)
  ) {
    throw new Error(`Refusing cleanup outside this repository: ${absolute}`);
  }

  const info = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) continue;
  if (!info.isDirectory() || info.isSymbolicLink()) {
    throw new Error(`Refusing non-directory cleanup target: ${absolute}`);
  }
  if ((await realpath(absolute)) !== absolute) {
    throw new Error(`Refusing redirected cleanup target: ${absolute}`);
  }
  if (allowedNames) {
    const unexpected = (await readdir(absolute)).filter(
      (name) => !allowedNames.has(name),
    );
    if (unexpected.length > 0) {
      throw new Error(
        `Refusing to remove unexpected files in ${absolute}: ${unexpected.join(", ")}`,
      );
    }
  }
  targets.push(absolute);
}

for (const target of targets) {
  await rm(target, { recursive: true });
  process.stdout.write(`Removed ${target}\n`);
}
