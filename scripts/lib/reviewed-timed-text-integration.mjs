// Historical evidence only. Unknown edits must never inherit older proof.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "app/converter/ConverterApp.tsx": ["a89177c10e3e97851980b30f7756a4805db337cfbfb62b4c21835bdc021d0df7", "b76d1b77bad41f5fe1a27dff1c6de35764d8f96f49046a18fb3667c2c05faf93"],
  "workers/conversion.worker.ts": ["893908859d5098d7e2078d2ae8e4231e1b6b7ba199dac9126d8cf8a5c761dbe5", "08ea18dacc94cc5c01e25a9bd5347777f708039259dc22ccddf14c3d4dba0c83"],
  "lib/capability-registry.ts": ["24f400a4e53cd01fb689ac3613040e74d5e2afd3d0aeb01918c2e434c918008c", "bf2b92240bca3f400181e8871ac48bfd37dfeb5b0c3d366b65affe972d42468a"],
  "lib/conversion-protocol.ts": ["d93bd7045288ec0c4597a8d5a4fc4a3b4fe10b010cff133a9addd7f015e07f82", "f94eea35a6278bd1e12c7cd512688daca3c5246be7e0a185eb10309a7be39d0b"],
  "lib/media-source-inspection.ts": ["8dc9b23ce3045474f89da95e3d1fa56b1850b2eb3cdab91168bc39480798e99b", "d51fea54af6b29cc26ffc2887b39ec95c4cdd8768f6a56416ba9920e0df698ec"],
};
export function preTimedTextIntegration(file, bytes) {
  if (!Object.hasOwn(pins, file) || sha(bytes) !== pins[file][1]) return bytes;
  const archived = execFileSync("git", ["show", `c02444cfe0098e10c95317723945a1dfc136ca2e:${file}`],
    { windowsHide: true, maxBuffer: 1_048_576 });
  assert.equal(sha(archived), pins[file][0], file);
  return archived;
}
