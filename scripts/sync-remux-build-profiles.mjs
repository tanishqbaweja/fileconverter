import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check");
const manifestPath = path.join(projectRoot, "public", "engines", "remux", "build-manifest.json");
const buildScriptPath = path.join(projectRoot, "media", "ffmpeg", "build-remux.sh");
const manifestSource = await readFile(manifestPath, "utf8");
const manifest = JSON.parse(manifestSource);
const registryProfiles = conversionProfiles
  .filter((profile) => profile.engine.startsWith("ffmpeg-"))
  .map((profile) => profile.id);
const registryProfileSet = new Set(registryProfiles);
const synchronizedProfiles = manifest.profiles.filter((profile) =>
  registryProfileSet.has(profile),
);
const synchronizedProfileSet = new Set(synchronizedProfiles);
for (const profile of registryProfiles) {
  if (!synchronizedProfileSet.has(profile)) synchronizedProfiles.push(profile);
}
manifest.profiles = synchronizedProfiles;
const buildScript = await readFile(buildScriptPath, "utf8");
const serializedProfiles = JSON.stringify(manifest.profiles);
const manifestLines = ["{"];
const manifestEntries = Object.entries(manifest);
for (let index = 0; index < manifestEntries.length; index += 1) {
  const [key, value] = manifestEntries[index];
  const comma = index === manifestEntries.length - 1 ? "" : ",";
  if (key === "modules") {
    manifestLines.push(`  ${JSON.stringify(key)}: [`);
    value.forEach((module, moduleIndex) => {
      const moduleComma = moduleIndex === value.length - 1 ? "" : ",";
      manifestLines.push(`    ${compactJson(module)}${moduleComma}`);
    });
    manifestLines.push(`  ]${comma}`);
  } else if (key === "profiles") {
    manifestLines.push(`  ${JSON.stringify(key)}: ${serializedProfiles}${comma}`);
  } else {
    manifestLines.push(`  ${JSON.stringify(key)}: ${compactJson(value)}${comma}`);
  }
}
manifestLines.push("}");
const synchronizedManifest = `${manifestLines.join("\n")}\n`;
const rootProfilesPattern = /^  "profiles": \[[^\r\n]*\],$/m;
if (!rootProfilesPattern.test(buildScript)) {
  throw new Error("Could not find the root FFmpeg profile declaration to synchronize.");
}
const synchronized = buildScript.replace(
  rootProfilesPattern,
  `  "profiles": ${serializedProfiles},`,
);
if (checkOnly) {
  const staleFiles = [];
  if (manifestSource !== synchronizedManifest) staleFiles.push(path.relative(projectRoot, manifestPath));
  if (buildScript !== synchronized) staleFiles.push(path.relative(projectRoot, buildScriptPath));
  if (staleFiles.length > 0) {
    throw new Error(`FFmpeg build profiles are stale in: ${staleFiles.join(", ")}`);
  }
  process.stdout.write(`Verified ${manifest.profiles.length} synchronized FFmpeg build profiles.\n`);
} else {
  await writeFile(manifestPath, synchronizedManifest, "utf8");
  await writeFile(buildScriptPath, synchronized, "utf8");
  process.stdout.write(`Synchronized ${manifest.profiles.length} FFmpeg build profiles.\n`);
}

function compactJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(compactJson).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .map(([key, nested]) => `${JSON.stringify(key)}: ${compactJson(nested)}`)
      .join(", ")}}`;
  }
  return JSON.stringify(value);
}
