import { createHash } from "node:crypto";
import { copyFile, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const candidate = path.join(root, "work/mpeg2-candidate-output");
const target = path.join(root, "dist/client/engines/remux");
const published = path.join(root, "public/engines/remux");
const digest = async (file) => createHash("sha256").update(await readFile(file)).digest("hex");
const manifest = JSON.parse(await readFile(path.join(candidate, "build-manifest.json"), "utf8"));
const inputMode = process.argv[3] ?? "legacy";
if (!["legacy", "byob"].includes(inputMode)) throw new Error("Private input mode must be legacy or byob");
const adapter = `// PRIVATE_MPEG2_FEASIBILITY_ADAPTER_NOT_PUBLIC_SUPPORT
import factory from "/engines/remux/_candidate_mpeg2_base.mjs";
export default async function(options) {
${manifest.allocatorDiagnostic ? `  options = { ...options, withinBridge: { ...options.withinBridge, allocatorDiagnostic(sample) {
    console.debug("WITHIN_MPEG2_ALLOCATOR " + JSON.stringify(sample));
  } } };
` : ""}
${inputMode === "byob" ? "  options = { ...options, withinBridge: { ...options.withinBridge, readSync: undefined } };\n" : ""}  let core;
  try { core = await factory(options); }
  catch (error) { throw new Error("Candidate factory: " + String(error.message) + "\\n" + String(error.stack).slice(0, 2048)); }
  const call = core.ccall.bind(core);
  core.ccall = async (name, type, types, args, settings) => {
    let mapped = [...args];
    if (mapped[0] === 4) mapped = [6, ...mapped.slice(1, 4), 0, 0, 0, ...mapped.slice(4)];
    if (mapped[0] === 1) mapped[0] = 6;
    try { return await call(name, type, mapped.map(() => "number"), mapped, settings); }
    catch (error) { throw new Error("Candidate ccall: " + String(error.message) + "\\n" + String(error.stack).slice(0, ${manifest.allocatorDiagnostic ? 4096 : 2048})); }
  };
  return core;
}
`;
const adapterHash = createHash("sha256").update(adapter).digest("hex");
const files = ["within-remux.mjs", "within-remux.wasm", "within-mpeg4.mjs", "within-mpeg4.wasm"];
const base = path.join(target, "_candidate_mpeg2_base.mjs");
for (const file of ["within-mpeg2.mjs", "within-mpeg2.wasm"]) {
  if (await digest(path.join(candidate, file)) !== manifest.artifacts[file]) throw new Error(`Candidate artifact mismatch: ${file}`);
}
if (process.argv[2] === "stage") {
  for (const file of files) {
    if (await digest(path.join(target, file)) !== await digest(path.join(published, file))) {
      throw new Error(`Refusing to replace unexpected generated asset: ${file}`);
    }
  }
  await writeFile(base, await readFile(path.join(candidate, "within-mpeg2.mjs")), { flag: "wx" });
  try {
    for (const file of files) {
      if (file.endsWith(".wasm")) await copyFile(path.join(candidate, "within-mpeg2.wasm"), path.join(target, file));
      else await writeFile(path.join(target, file), adapter);
    }
  } catch (error) {
    for (const file of files) await copyFile(path.join(published, file), path.join(target, file));
    await rm(base, { force: true });
    throw error;
  }
  process.stdout.write("Staged private candidate in disposable production-build assets only. Public engines remain unchanged.\n");
} else if (process.argv[2] === "restore") {
  for (const file of files) {
    const expected = file.endsWith(".wasm") ? manifest.artifacts["within-mpeg2.wasm"] : adapterHash;
    if (await digest(path.join(target, file)) !== expected) throw new Error(`Refusing unexpected asset: ${file}`);
  }
  if (await digest(base) !== manifest.artifacts["within-mpeg2.mjs"]) throw new Error("Unexpected candidate base module.");
  for (const file of files) await copyFile(path.join(published, file), path.join(target, file));
  await rm(base);
  for (const file of files) {
    if (await digest(path.join(target, file)) !== await digest(path.join(published, file))) throw new Error("Restoration hash mismatch.");
  }
  process.stdout.write("Restored generated production assets to exact published hashes; private adapter deleted.\n");
} else throw new Error("Usage: node scripts/stage-mpeg2-candidate.mjs stage|restore [legacy|byob] (server stopped)");
