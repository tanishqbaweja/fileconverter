import { readFile, writeFile, realpath } from "node:fs/promises";
import path from "node:path";
import { makeVaaReference } from "./lib/openh264-vaa-reference.mjs";

const root = path.resolve(import.meta.dirname, "..");
const build = path.join(root, "work/h264-vaa-arithmetic-build");
const input = path.join(build, "vaacalcfuncs.cpp");
const output = path.join(build, "vaa-reference.h");
if (await realpath(build) !== build) throw new Error("Arithmetic build path must not be redirected");
await writeFile(output, makeVaaReference(await readFile(input)), { flag: "wx" });
