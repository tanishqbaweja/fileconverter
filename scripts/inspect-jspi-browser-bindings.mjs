// Read-only, bounded inspection of frozen generated source; no browser/media.
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { deriveCatalogueSlotDriver, deriveCatalogueSlotCaller } from "./lib/catalogue-slot-control.mjs";
import path from "node:path";
import { loadUpdatedChromeQualification } from "./lib/updated-chrome-qualification.mjs";
const root = path.resolve(import.meta.dirname, "..");
if (process.argv[2] === "--composition") {
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT = "evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  const qualified = await loadUpdatedChromeQualification(root);
  const composition = qualified.historical.generated.composition;
  console.log(JSON.stringify({ files: composition.files, manifest: { artifacts: composition.manifest.artifacts,
    nativeStackBytesPerCore: composition.manifest.nativeStackBytesPerCore, asyncifyStackBytesDecoder: composition.manifest.asyncifyStackBytesDecoder,
    memories: composition.manifest.memories, keys: Object.keys(composition.manifest) } }, null, 2));
  process.exit(0);
}
const unpack = async file => JSON.parse(gunzipSync(await readFile(path.join(root, file)), { maxOutputLength: 8388608 }));
const old = await unpack("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz");
const qualified = await unpack("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz");
const driver = deriveCatalogueSlotDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-reviewABC"), "allocation-attempt-media-reviewABC", []).generated;
const caller = deriveCatalogueSlotCaller(await readFile(path.join(root, "scripts/run-updated-chrome-full.mjs"), "utf8"), root).generated;
const stage = qualified.recipe.generated.stage;
const adapterMatch = stage.match(/^const adapter = ("[^\r\n]+");$/m);
if (!adapterMatch) throw new Error("Unique adapter source required");
const sources = { stage: stage.replace(adapterMatch[0], "const adapter = /* see adapter */;"),
  adapter: JSON.parse(adapterMatch[1]), spec: qualified.recipe.generated.spec, driver, caller };
const pattern = new RegExp(process.argv[2] ?? "Asyncify|asyncify|manifest|composition|copyUpdatedChrome|deriveUpdatedChromeFullStager|artifacts|WasmMemory|memoryLimits|actualWasmMemory|HEAP|STACK_RESERVE|SPLIT_FINAL");
for (const [name, source] of Object.entries(sources)) {
  const lines = source.split(/\r?\n/), selected = new Set();
  for (let index = 0; index < lines.length; index++) if (pattern.test(lines[index]))
    for (let other = Math.max(0, index - 1); other <= Math.min(lines.length - 1, index + 2); other++) selected.add(other);
  if (process.argv[3] && process.argv[3] !== name) continue;
  if (process.argv[4]) {
    const [start, end] = process.argv[4].split(":").map(Number); selected.clear();
    if (!(start >= 1 && end >= start && end - start <= 180)) throw new Error("Bounded source line selection required");
    for (let index = start - 1; index < Math.min(end, lines.length); index++) selected.add(index);
  }
  console.log(name + "\n" + [...selected].slice(0, 150).map(index => `${index + 1}: ${lines[index].length < 900 ? lines[index] : `[omitted ${lines[index].length}-character inventory/literal]`}`).join("\n"));
}
