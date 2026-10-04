import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { makeSadReference } from "./lib/openh264-sad-reference.mjs";

const root = path.resolve(import.meta.dirname, "..");
const build = path.join(root, "work/h264-sad-arithmetic-build");
if (await realpath(build) !== build) throw new Error("SAD build path must not be redirected");
await writeFile(path.join(build, "sad-reference.h"), makeSadReference(await readFile(path.join(build, "sad_common.cpp"))), { flag: "wx" });
