import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";

const projectRoot = path.resolve(import.meta.dirname, "..");
const workersRoot = path.join(projectRoot, "workers");
const workerFiles = readdirSync(workersRoot)
  .filter((name) => name.endsWith(".ts"))
  .sort();

const source = (relativePath) =>
  readFileSync(path.join(projectRoot, relativePath), "utf8");

function parseWorker(name) {
  const text = source(path.join("workers", name));
  return {
    text,
    tree: ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true),
  };
}

function declarationNames(declaration) {
  if (ts.isIdentifier(declaration.name)) return [declaration.name.text];
  return declaration.name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : declarationNames(element),
  );
}

function topLevelMutableNames(tree) {
  const names = [];
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (statement.declarationList.flags & ts.NodeFlags.Const) continue;
    for (const declaration of statement.declarationList.declarations) {
      names.push(...declarationNames(declaration));
    }
  }
  return names.sort();
}

function isContainerInitializer(initializer) {
  if (!initializer) return false;
  if (ts.isArrayLiteralExpression(initializer)) return true;
  if (!ts.isNewExpression(initializer)) return false;
  const name = initializer.expression.getText();
  return ["Array", "Map", "Set", "WeakMap", "WeakSet", "Uint8Array", "ArrayBuffer"].includes(name);
}

function topLevelConstContainers(tree) {
  const names = [];
  for (const statement of tree.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    if (!(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (isContainerInitializer(declaration.initializer)) {
        names.push(...declarationNames(declaration));
      }
    }
  }
  return names;
}

test("every worker module has an explicit cross-job retained-state contract", () => {
  assert.equal(workerFiles.length, 30, "audit inventory must be updated for worker additions or removals");
  const expectedMutable = new Map([
    [
      "conversion.worker.ts",
      [
        "activeJobId",
        "cancelled",
        "lastCancellationYieldBytes",
        "lastProgressAt",
        "resvgInitialization",
      ],
    ],
    [
      "direct-file-writer.worker.ts",
      [
        "busy",
        "control",
        "errorBytes",
        "faultInjected",
        "ownedPayload",
        "payload",
        "position",
        "streamWriter",
        "testFault",
      ],
    ],
  ]);

  for (const name of workerFiles) {
    const { tree } = parseWorker(name);
    assert.deepEqual(
      topLevelMutableNames(tree),
      expectedMutable.get(name) ?? [],
      `${name}: unexpected module-scoped mutable state can retain job data across conversions`,
    );
  }
});

test("module-scoped worker containers are immutable after initialization", () => {
  const mutators = new Set([
    "add",
    "clear",
    "copyWithin",
    "delete",
    "fill",
    "pop",
    "push",
    "reverse",
    "set",
    "shift",
    "sort",
    "splice",
    "unshift",
  ]);

  for (const name of workerFiles) {
    const { tree } = parseWorker(name);
    const containers = new Set(topLevelConstContainers(tree));
    const visit = (node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        containers.has(node.expression.expression.text) &&
        mutators.has(node.expression.name.text)
      ) {
        assert.fail(
          `${name}: module-scoped ${node.expression.expression.text} is mutated with ${node.expression.name.text}()`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(tree);
  }
});

test("the only message-loop entrypoints have bounded responses and terminal cleanup", () => {
  const entrypoints = workerFiles.filter((name) =>
    parseWorker(name).text.includes("DedicatedWorkerGlobalScope"),
  );
  assert.deepEqual(entrypoints, [
    "conversion.worker.ts",
    "direct-file-writer.worker.ts",
  ]);

  const conversionWorker = source("workers/conversion.worker.ts");
  assert.match(conversionWorker, /phase:\s*message\.phase\.slice\(0, MAX_PROGRESS_PHASE_CHARS\)/);
  assert.match(conversionWorker, /message:\s*message\.message\.slice\(0, MAX_WORKER_RESPONSE_TEXT_CHARS\)/);
  assert.match(conversionWorker, /now - lastProgressAt < MIN_PROGRESS_INTERVAL_MS/);
  assert.match(conversionWorker, /finally\s*{\s*activeJobId = null;\s*cancelled = false;/s);
  assert.doesNotMatch(conversionWorker, /setInterval\s*\(/);

  const directWorker = source("workers/direct-file-writer.worker.ts");
  assert.match(directWorker, /error\.message}`\.slice\(\s*0,\s*MAX_WORKER_RESPONSE_TEXT_CHARS/s);
  assert.match(directWorker, /ownedPayload = new Uint8Array\(payload\.byteLength\)/);

  const destination = source("workers/random-access-destination.ts");
  assert.match(destination, /const fail = \(message: string\) => {\s*worker\.terminate\(\)/s);
  assert.match(destination, /async close\(\) {\s*command\(DIRECT_CLOSE\);\s*closed = true;\s*worker\.terminate\(\)/s);
  assert.match(destination, /async abort\(\) {.*?finally {\s*closed = true;\s*worker\.terminate\(\)/s);

  const app = source("app/converter/ConverterApp.tsx");
  assert.match(app, /const replaceWorker = .*?retired\.terminate\(\)/s);
  assert.match(app, /return \(\) => {.*?window\.clearTimeout\(replacementTimer\);.*?workerRef\.current\?\.terminate\(\)/s);
  assert.match(app, /return \(\) => window\.clearInterval\(timer\)/);
});

test("worker messages, warnings, and batch-retained state have hard limits", () => {
  const limits = source("lib/resource-limits.ts");
  assert.match(limits, /MAX_BATCH_FILES = 256/);
  assert.match(limits, /MAX_RETAINED_WARNINGS = 8/);
  assert.match(limits, /MAX_WORKER_RESPONSE_TEXT_CHARS = 2_048/);
  assert.match(limits, /MAX_PROGRESS_PHASE_CHARS = 256/);
  assert.match(limits, /MIN_PROGRESS_INTERVAL_MS = 125/);

  const app = source("app/converter/ConverterApp.tsx");
  assert.match(app, /nextFiles\.length > MAX_BATCH_FILES/);
  assert.match(app, /current\.slice\(1 - MAX_RETAINED_WARNINGS\)/);
  assert.match(app, /warning\.slice\(0, MAX_WORKER_RESPONSE_TEXT_CHARS\)/);

  const conversionProtocol = source("lib/conversion-protocol.ts").split(
    "export type WorkerResponse =",
  )[1];
  assert.ok(conversionProtocol, "WorkerResponse declaration is missing");
  assert.doesNotMatch(conversionProtocol, /\b(?:ArrayBuffer|Blob|File|SharedArrayBuffer|Uint8Array)\b/);

  const directProtocol = source("workers/direct-writer-protocol.ts").split(
    "export type DirectWriterResponse =",
  )[1];
  assert.ok(directProtocol, "DirectWriterResponse declaration is missing");
  assert.doesNotMatch(directProtocol, /\b(?:ArrayBuffer|Blob|File|SharedArrayBuffer|Uint8Array)\b/);
});

test("native engine diagnostics use fixed-count, fixed-width rings", () => {
  const audited = [
    "workers/avif-conversion.ts",
    "workers/avif-encoding.ts",
    "workers/jxl-conversion.ts",
    "workers/jxl-encoding.ts",
    "workers/media-remux.ts",
    "workers/sevenzip-conversion.ts",
    "workers/tiff-conversion.ts",
  ];
  for (const file of audited) {
    const text = source(file);
    assert.match(text, /\.trim\(\)\.slice\(0, (?:512|MAX_ENGINE_ERROR_CHARS)\)/, `${file}: diagnostic width`);
    assert.match(text, /if \((?:errors|engineErrors)\.length === (?:8|MAX_ENGINE_ERRORS)\) (?:errors|engineErrors)\.shift\(\)/, `${file}: diagnostic count`);
  }
});
