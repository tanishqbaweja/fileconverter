import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = await realpath(path.resolve(import.meta.dirname, ".."));
const targets = [
  { relative: "output/playwright/audio-metadata-map.json", kind: "file" },
  {
    relative: "output/playwright/artifacts",
    kind: "directory",
    allowedNames: new Set([".last-run.json"]),
  },
  {
    relative: "output/playwright/report",
    kind: "directory",
    allowedNames: new Set(["index.html"]),
  },
  { relative: "work/temp-audio-map", kind: "directory" },
];

const checked = [];
for (const target of targets) {
  const absolute = path.resolve(projectRoot, target.relative);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing cleanup outside the repository: ${absolute}`);
  }
  const info = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) continue;
  if (info.isSymbolicLink() ||
      (target.kind === "file" && !info.isFile()) ||
      (target.kind === "directory" && !info.isDirectory()) ||
      (await realpath(absolute)) !== absolute) {
    throw new Error(`Refusing redirected or unexpected cleanup target: ${absolute}`);
  }
  if (target.allowedNames) {
    const unexpected = (await readdir(absolute)).filter(
      (name) => !target.allowedNames.has(name),
    );
    if (unexpected.length > 0) {
      throw new Error(`Refusing unexpected files in ${absolute}: ${unexpected.join(", ")}`);
    }
  }
  checked.push({ absolute, kind: target.kind });
}

for (const { absolute, kind } of checked) {
  await rm(absolute, { recursive: kind === "directory" });
  process.stdout.write(`Removed ${absolute}\n`);
}
