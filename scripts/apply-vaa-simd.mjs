import { createHash } from "node:crypto";
import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { patchVaaSource, verifyVaaProof } from "./lib/openh264-vaa-patch.mjs";

const root = path.resolve(import.meta.dirname, "..");
const build = path.join(root, "work/h264-candidate-build");
const sourcePath = path.join(build, "openh264/codec/processing/src/vaacalc/vaacalcfuncs.cpp");
if (await realpath(sourcePath) !== sourcePath) throw new Error("VAA source path is not the owned extracted source");
const helper = await readFile(path.join(root, "media/ffmpeg/openh264-vaa-simd.h"));
const rawProof = await readFile(path.join(root, "evidence/openh264-vaa-arithmetic-2026-10-04.json"));
const proof = verifyVaaProof(JSON.parse(rawProof), helper);
const patched = patchVaaSource(await readFile(sourcePath));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await writeFile(path.join(path.dirname(sourcePath), "openh264-vaa-simd.h"), helper, { flag: "wx" });
await writeFile(sourcePath, patched);
await writeFile(path.join(build, "vaa-simd-patch.json"), `${JSON.stringify({
  ...proof, proofEvidenceSha256: sha(rawProof), patchedSourceSha256: sha(patched),
  applierSha256: sha(await readFile(path.join(root, "scripts/apply-vaa-simd.mjs"))),
  patchLogicSha256: sha(await readFile(path.join(root, "scripts/lib/openh264-vaa-patch.mjs"))),
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write("Applied proven exact-result private VAA SIMD delegate; all codec settings unchanged.\n");
