// Exact existing independent acceptance checks; only new labels/native identity.
import { readFile } from "node:fs/promises";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
const parent = await readFile(new URL("./jspi-browser-observation.mjs", import.meta.url), "utf8");
export const ltoObservationDerivation = exactPatch(parent, [
  ['"jspi-small-output-controls-finished-pending-audit-not-acceptance"', '"lto-small-output-controls-finished-pending-audit-not-acceptance"'],
  ['"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance"', '"six-small-lto-outputs-and-adverse-recovery-not-full-acceptance"'],
  ['"4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57"', '"49e8229f4bbfb43fb93c0c59ebfa2fac9f3574944f50c58078d6d1dd00925c2d"'],
  ['"six-genuine-small-jspi-conversions-and-all-adverse-recoveries-verified-below-budget"', '"six-genuine-small-lto-conversions-and-all-adverse-recoveries-verified-below-budget"'],
]);
const factory = await import("data:text/javascript;base64," + Buffer.from(ltoObservationDerivation.generated).toString("base64"));
export const inspectLtoBrowserResult = factory.inspectJspiBrowserResult;
