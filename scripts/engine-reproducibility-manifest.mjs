import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");

const engines = [
  {
    id: "ffmpeg-remux",
    command: "npm run build:ffmpeg-remux",
    output: "public/engines/remux",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "bzip2",
    command: "npm run build:bzip2",
    output: "public/engines/bzip2",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "xz",
    command: "npm run build:xz",
    output: "public/engines/xz",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "xz-decoder",
    command: "npm run build:xz-decoder",
    output: "public/engines/xz-decoder",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "archive7z",
    command: "npm run build:archive7z",
    output: "public/engines/archive7z",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "tiff",
    command: "npm run build:tiff",
    output: "public/engines/tiff",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "jxl",
    command: "npm run build:jxl",
    output: "public/engines/jxl",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "jxl-encoder",
    command: "npm run build:jxl-encoder",
    output: "public/engines/jxl-encoder",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "avif",
    command: "npm run build:avif",
    output: "public/engines/avif",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "avif-encoder",
    command: "npm run build:avif-encoder",
    output: "public/engines/avif-encoder",
    installNodeModules: false,
    buildEnvironment: "docker",
  },
  {
    id: "svg",
    command: "npm run build:svg",
    output: "public/engines/svg",
    installNodeModules: true,
    buildEnvironment: "node",
  },
];

async function auditManifest() {
  const packageJson = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  const published = (
    await readdir(path.join(projectRoot, "public", "engines"), {
      withFileTypes: true,
    })
  )
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  const declared = engines
    .map((engine) => path.basename(engine.output))
    .sort();

  if (new Set(declared).size !== declared.length) {
    throw new Error("Engine reproducibility manifest contains duplicate outputs.");
  }
  if (JSON.stringify(published) !== JSON.stringify(declared)) {
    throw new Error(
      `Published engine directories do not match the reproducibility manifest.\nPublished: ${published.join(", ")}\nDeclared: ${declared.join(", ")}`,
    );
  }

  for (const engine of engines) {
    const scriptName = engine.command.replace(/^npm run /, "");
    if (!packageJson.scripts?.[scriptName]) {
      throw new Error(
        `Engine ${engine.id} references missing package script ${scriptName}.`,
      );
    }
    const declaredCommand = packageJson.scripts[scriptName];
    const actuallyUsesDocker = /^docker(?:\s|$)/.test(declaredCommand);
    if ((engine.buildEnvironment === "docker") !== actuallyUsesDocker) {
      throw new Error(
        `Engine ${engine.id} build environment does not match package script ${scriptName}.`,
      );
    }
  }

  process.stdout.write(
    `Reproducibility manifest covers ${engines.length} published engine directories.\n`,
  );
}

if (process.argv.includes("--check")) {
  await auditManifest();
} else {
  const selectedEngines = process.argv.includes("--non-docker")
    ? engines.filter((engine) => engine.buildEnvironment !== "docker")
    : engines;
  process.stdout.write(JSON.stringify({ include: selectedEngines }));
}
