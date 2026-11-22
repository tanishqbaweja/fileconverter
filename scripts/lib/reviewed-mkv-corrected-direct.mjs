// Historical bytes only. Never substitute them when building or running a new gate.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "app/converter/ConverterApp.tsx": [
    "b76d1b77bad41f5fe1a27dff1c6de35764d8f96f49046a18fb3667c2c05faf93",
    "ba8a6ac23ecfc96e7da7265796d3848c7877200a3164dd653ce8b0c37556b00d"
  ],
  "workers/conversion.worker.ts": [
    "08ea18dacc94cc5c01e25a9bd5347777f708039259dc22ccddf14c3d4dba0c83",
    "3a6d982095c78e879bb9e95df71f02d30d44e06ecdf1994044940f3673b70e86"
  ],
  "workers/media-remux.ts": [
    "1b1afb350aafaa1bbc13f0f5150bdedeb85a94c1510318fa8713b4b7f5edbf59",
    "db6bda09686b23c0a452adcc8490b4cdabfa2276349fd1069774da07079f8bdb"
  ],
  "lib/conversion-protocol.ts": [
    "f94eea35a6278bd1e12c7cd512688daca3c5246be7e0a185eb10309a7be39d0b",
    "68e71a7b7d416632213ffcd6d10f68bb293af2eb8c4d1e2813455852709e76fb"
  ]
};

export function preMkvCorrectedDirectIntegration(file, bytes) {
  // Only the reviewed OPFS activity change is also reversible here. The live
  // qualification paths keep requiring their exact original production pins.
  const hash = sha(bytes);
  const opfsActivityApp = file === "app/converter/ConverterApp.tsx" && hash === "27967d4d9342da03350348a00c8436dcc0fba0160dab9ffcea02a723ce80c0a8";
  if (!Object.hasOwn(pins, file) || (hash !== pins[file][1] && !opfsActivityApp)) return bytes;
  const archived = execFileSync("git", ["show", `f3ecde6d234f407bbb55712110acefc2a0777d80:${file}`],
    { windowsHide: true, maxBuffer: 1_048_576 });
  assert.equal(sha(archived), pins[file][0], file);
  return archived;
}
