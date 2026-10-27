import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");

const engines = [
  {
    id: "ffmpeg-remux",
    reproductionKind: "native-source",
    command: "npm run build:ffmpeg-remux",
    output: "public/engines/remux",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash media/ffmpeg/reproduce-nondocker.sh",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "bzip2",
    reproductionKind: "native-source",
    command: "npm run build:bzip2",
    output: "public/engines/bzip2",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash compression/bzip2/reproduce-nondocker.sh",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "xz",
    reproductionKind: "native-source",
    command: "npm run build:xz",
    output: "public/engines/xz",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash compression/xz/reproduce-nondocker.sh full",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "xz-decoder",
    reproductionKind: "native-source",
    command: "npm run build:xz-decoder",
    output: "public/engines/xz-decoder",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash compression/xz/reproduce-nondocker.sh decoder",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "archive7z",
    reproductionKind: "native-source",
    command: "npm run build:archive7z",
    output: "public/engines/archive7z",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash compression/libarchive7z/reproduce-nondocker.sh",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "tiff",
    reproductionKind: "native-source",
    command: "npm run build:tiff",
    output: "public/engines/tiff",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libtiff/reproduce-nondocker.sh",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "jxl",
    reproductionKind: "native-source",
    command: "npm run build:jxl",
    output: "public/engines/jxl",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libjxl/reproduce-nondocker.sh decoder",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "jxl-inspector",
    reproductionKind: "native-source",
    command: "npm run build:jxl-inspector",
    output: "public/engines/jxl-inspector",
    installNodeModules: false,
    buildEnvironment: "nondocker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libjxl-inspector/reproduce-nondocker.sh",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "jxl-encoder",
    reproductionKind: "native-source",
    command: "npm run build:jxl-encoder",
    output: "public/engines/jxl-encoder",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libjxl/reproduce-nondocker.sh encoder",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "avif",
    reproductionKind: "native-source",
    command: "npm run build:avif",
    output: "public/engines/avif",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libavif/reproduce-nondocker.sh decoder",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "avif-encoder",
    reproductionKind: "native-source",
    command: "npm run build:avif-encoder",
    output: "public/engines/avif-encoder",
    installNodeModules: false,
    buildEnvironment: "docker",
    nonDockerCommand:
      "source work/emsdk/emsdk_env.sh && bash images/libavif/reproduce-nondocker.sh encoder",
    emscriptenVersion: "6.0.4",
    emsdkCommit: "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  },
  {
    id: "svg",
    reproductionKind: "pinned-package-copy",
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
    if (!["native-source", "pinned-package-copy"].includes(engine.reproductionKind)) {
      throw new Error(`Engine ${engine.id} lacks an explicit reproduction kind.`);
    }
    if (engine.reproductionKind === "native-source" && !engine.nonDockerCommand) {
      throw new Error(`Engine ${engine.id} has no declared no-Docker source recipe.`);
    }
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
    if (engine.nonDockerCommand) {
      const scriptMatch = engine.nonDockerCommand.match(/bash\s+([^\s&]+)/);
      if (!scriptMatch) {
        throw new Error(
          `Engine ${engine.id} has an invalid non-Docker command.`,
        );
      }
      await access(path.join(projectRoot, scriptMatch[1]));
    }
  }

  process.stdout.write(
    `Reproducibility manifest covers ${engines.length} published engine directories.\n`,
  );
  const packageCopies = engines.filter(engine => engine.reproductionKind === "pinned-package-copy");
  process.stdout.write(JSON.stringify({ scope: "recipe-inventory-not-executed-rebuild-proof",
    nativeSourceRecipes: engines.length - packageCopies.length,
    pinnedPackageCopies: packageCopies.map(engine => engine.id),
    allPublishedEnginesHaveSourceRecipes: packageCopies.length === 0 }) + "\n");
  if (process.argv.includes("--require-source-builds") && packageCopies.length) {
    throw new Error(`Source-only reproduction is incomplete: ${packageCopies.map(engine => engine.id).join(", ")} copies a pinned package instead of compiling source.`);
  }
}

if (process.argv.includes("--require-source-builds") && !process.argv.includes("--check")) {
  throw new Error("--require-source-builds requires --check; it cannot silently select a build matrix.");
}
if (process.argv.includes("--check")) {
  await auditManifest();
} else {
  let selectedEngines = process.argv.includes("--non-docker")
    ? engines
        .filter(
          (engine) =>
            engine.buildEnvironment !== "docker" || engine.nonDockerCommand,
        )
        .map((engine) => ({
          ...engine,
          command: engine.nonDockerCommand ?? engine.command,
        }))
    : engines;
  const engineArgument = process.argv.indexOf("--engine");
  if (engineArgument >= 0) {
    const engineId = process.argv[engineArgument + 1];
    if (!engineId || engineId.startsWith("--")) {
      throw new Error("--engine requires an engine id.");
    }
    selectedEngines = selectedEngines.filter((engine) => engine.id === engineId);
    if (selectedEngines.length !== 1) {
      throw new Error(`Unknown or unavailable engine id: ${engineId}`);
    }
  }
  process.stdout.write(JSON.stringify({ include: selectedEngines }));
}
