import { createHash } from "node:crypto";
import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { patchSadSource, verifySadProof } from "./lib/openh264-sad-patch.mjs";

const root = path.resolve(import.meta.dirname, ".."), build = path.join(root, "work/h264-candidate-build");
const sourcePath = path.join(build, "openh264/codec/common/src/sad_common.cpp");
if (await realpath(sourcePath) !== sourcePath) throw new Error("SAD source path is not the owned extracted source");
const helper = await readFile(path.join(root, "media/ffmpeg/openh264-sad-simd.h"));
const rawProof = await readFile(path.join(root, "evidence/openh264-sad-arithmetic-2026-10-04.json"));
const proof = verifySadProof(JSON.parse(rawProof), helper);
const patched = patchSadSource(await readFile(sourcePath));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
await writeFile(path.join(path.dirname(sourcePath), "openh264-sad-simd.h"), helper, { flag: "wx" });
await writeFile(sourcePath, patched);
await writeFile(path.join(build, "sad-simd-patch.json"), `${JSON.stringify({ ...proof,
  proofEvidenceSha256: sha(rawProof), patchedSourceSha256: sha(patched),
  applierSha256: sha(await readFile(path.join(root, "scripts/apply-sad-simd.mjs"))),
  patchLogicSha256: sha(await readFile(path.join(root, "scripts/lib/openh264-sad-patch.mjs"))),
}, null, 2)}\n`, { flag: "wx" });
process.stdout.write("Applied proven exact-result private SAD SIMD delegates; all codec settings unchanged.\n");
