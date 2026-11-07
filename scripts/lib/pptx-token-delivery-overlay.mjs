// Private A/B only. The shipped app, worker, parser and lexer remain untouched.
// Both arms use the same bounded lexer/parser; only token delivery differs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { build, version } from "esbuild";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const tokenDeliveryPins = Object.freeze({
  "workers/docx-conversion.ts": "e64d554d7bb2f762bcf33b75c90dd22ea492419c5374db79a4a3745ec61bce4a",
  "workers/pptx-namespace-candidate.ts": "ae0ad6b161208f5c366d485e84280bdb6d60f39fd03415edbbb1b5d47f8ae91a",
  "workers/conversion.worker.ts": "b1043f246fb570c84f50f21fa1b5b6a4a6dd23a7240ee0c6fe2f0ab866825dd0",
  "workers/random-access-destination.ts": "f46a4db401daabeb40a0b9eaa9feb256b623c21d2a7f41af549b6797842b4375",
});
function once(source, before, after) {
  assert.equal(source.split(before).length, 2, "Expected a unique reviewed source anchor");
  const result = source.replace(before, () => after);
  assert.equal(result.split(after).length, 2);
  assert.equal(result.replace(after, () => before), source);
  return result;
}

export function preparePptxTokenDeliverySources(docx, candidate, mode) {
  assert.ok(["iterator", "callback"].includes(mode));
  assert.equal(sha(docx), tokenDeliveryPins["workers/docx-conversion.ts"]);
  assert.equal(sha(candidate), tokenDeliveryPins["workers/pptx-namespace-candidate.ts"]);
  let lexer = docx.toString("utf8"), parser = candidate.toString("utf8");
  lexer = once(lexer, '  formatLabel = "DOCX",\n): AsyncGenerator<MarkupToken> {',
    '  formatLabel = "DOCX",\n  sink?: (token: MarkupToken) => void | Promise<void>,\n): AsyncGenerator<MarkupToken> {');
  for (const [final, indent] of [[false, "      "], [true, "    "]]) {
    const before = `${indent}const token = take(${final});\n${indent}if (!token) break;\n${indent}`;
    lexer = once(lexer, before + "yield token;", before + `if (!sink) yield token;
${indent}else {
${indent}  const pending = sink(token);
${indent}  if (pending) await pending;
${indent}}`);
  }
  lexer = once(lexer, "function validateXmlDeclaration(value: string, formatLabel: string): void {",
    `// Private PPTX experiment. No additional reader, queue, or token batch.
export async function consumeMarkupTokens(
  source: Parameters<typeof readMarkupTokens>[0],
  runtime: Parameters<typeof readMarkupTokens>[1],
  formatLabel: string,
  sink: (token: MarkupToken) => void | Promise<void>,
): Promise<void> {
  for await (const token of readMarkupTokens(source, runtime, formatLabel${mode === "callback" ? ", sink" : ""})) {
    const pending = sink(token);
    if (pending) await pending;
  }
}

function validateXmlDeclaration(value: string, formatLabel: string): void {`);

  parser = once(parser, "  readMarkupTokens,", "  consumeMarkupTokens,");
  parser = once(parser, "  for await (const token of readMarkupTokens(source, runtime, context)) {",
    "  await consumeMarkupTokens(source, runtime, context, (token) => {");
  parser = once(parser, "      const pending = handlers.text?.(value, stack.at(-1));\n      if (pending) await pending;",
    "      return handlers.text?.(value, stack.at(-1));");
  parser = once(parser, `      if (pending) await pending;
      if (parsed.selfClosing) {
        const closing = close(element);
        if (closing) await closing;
      } else {
        stack.push(element);
      }`, `      if (pending) return pending.then(() => {
        if (parsed.selfClosing) return close(element);
        stack.push(element);
      });
      if (parsed.selfClosing) return close(element);
      stack.push(element);`);
  parser = once(parser, `      const pending = close(opened);
      if (pending) await pending;
    }
  }
  if (!rootClosed)`, `      return close(opened);
    }
  });
  if (!rootClosed)`);
  return { lexer, parser };
}

export function tokenDeliveryPlugin({ root, sources, writerUrl, hits = new Set() }) {
  const worker = "workers/conversion.worker.ts";
  const pptx = "workers/pptx-conversion.ts";
  const docx = "workers/docx-conversion.ts";
  const bridge = "workers/random-access-destination.ts";
  return {
    name: "private-pptx-token-delivery",
    setup(api) {
      api.onLoad({ filter: /[\\/](?:conversion\.worker|pptx-conversion|docx-conversion|random-access-destination)\.ts$/ }, async args => {
        const relative = path.relative(root, args.path).replaceAll("\\", "/");
        if (relative === worker) {
          assert.equal(sha(await readFile(args.path)), tokenDeliveryPins[worker]);
          hits.add(relative);
          return;
        }
        let contents;
        if (relative === pptx) contents = sources.parser;
        if (relative === docx) contents = sources.lexer;
        if (relative === bridge && writerUrl) {
          assert.match(writerUrl, /^\/assets\/direct-file-writer\.worker-[\w-]+\.js$/);
          const raw = await readFile(args.path);
          assert.equal(sha(raw), tokenDeliveryPins[bridge]);
          contents = once(raw.toString(), 'new URL("./direct-file-writer.worker.ts", import.meta.url)', JSON.stringify(writerUrl));
        }
        if (contents === undefined) return;
        hits.add(relative);
        return { contents, loader: "ts", resolveDir: path.dirname(args.path) };
      });
    },
  };
}

export async function buildPrivatePptxTokenWorker({ root, runtime, mode }) {
  assert.equal(version, "0.28.1");
  assert.equal(path.dirname(runtime.directory), path.join(root, "work"));
  assert.match(path.basename(runtime.directory), /^pptx-text-[A-Za-z0-9]{6}$/);
  const assets = path.join(root, "dist/client/assets"), files = await readdir(assets);
  const workers = files.filter(name => /^conversion\.worker-[\w-]+\.js$/.test(name));
  const writers = files.filter(name => /^direct-file-writer\.worker-[\w-]+\.js$/.test(name));
  assert.equal(workers.length, 1); assert.equal(writers.length, 1);
  const [docx, candidate] = await Promise.all(["workers/docx-conversion.ts", "workers/pptx-namespace-candidate.ts"]
    .map(file => readFile(path.join(root, file))));
  const sources = preparePptxTokenDeliverySources(docx, candidate, mode);
  const control = preparePptxTokenDeliverySources(docx, candidate, "iterator");
  const treatment = preparePptxTokenDeliverySources(docx, candidate, "callback");
  assert.equal(control.parser, treatment.parser);
  assert.equal(once(treatment.lexer, "readMarkupTokens(source, runtime, formatLabel, sink)",
    "readMarkupTokens(source, runtime, formatLabel)"), control.lexer);
  const hits = new Set();
  const result = await build({ absWorkingDir: root, entryPoints: ["workers/conversion.worker.ts"], bundle: true,
    platform: "browser", format: "esm", target: "es2022", minify: true, write: false,
    plugins: [tokenDeliveryPlugin({ root, sources, writerUrl: "/assets/" + writers[0], hits })] });
  assert.deepEqual([...hits].sort(), ["workers/conversion.worker.ts", "workers/docx-conversion.ts",
    "workers/pptx-conversion.ts", "workers/random-access-destination.ts"]);
  assert.equal(result.outputFiles.length, 1);
  const bytes = result.outputFiles[0].contents;
  assert.ok(bytes.length <= 1048576);
  const file = path.join(runtime.directory, "private-pptx-token-worker.mjs");
  await writeFile(file, bytes, { flag: "wx" });
  return { file, mode, sha256: sha(bytes), bytes: bytes.length, requestedAsset: "/assets/" + workers[0],
    originalAssetSha256: sha(await readFile(path.join(assets, workers[0]))),
    candidateParserSha256: sha(sources.parser), lexerSha256: sha(sources.lexer),
    singleSourceFactorVerified: true, shippedAssetUnchanged: true, privateCompilerDiffersFromVite: true };
}
