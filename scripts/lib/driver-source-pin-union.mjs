// Preparation only: derive coverage from the exact generated driver, without eval.
import assert from "node:assert/strict";
export function deriveDriverSourcePinFiles(generated, callerFiles) {
  assert.equal(typeof generated, "string");
  assert.ok(Buffer.byteLength(generated) <= 1024 * 1024);
  const declarations = [...generated.matchAll(/^const sourceFiles = (\[[\s\S]*?\]);$/gm)];
  assert.equal(declarations.length, 1, "Exactly one static JSON driver source list required");
  const files = JSON.parse(declarations[0][1]);
  assert.ok(Array.isArray(files) && files.length > 0 && files.length <= 256);
  assert.ok(Array.isArray(callerFiles) && callerFiles.length <= 256);
  for (const file of [...files, ...callerFiles]) {
    assert.equal(typeof file, "string");
    assert.ok(file.length > 0 && file.length <= 512 && !file.includes("\\") &&
      !file.includes(":") && !file.includes("\0") && !file.startsWith("/") &&
      file.split("/").every(part => part && part !== "." && part !== ".."),
    "Source pins must be repository-relative paths, never traversal or media destinations");
    assert.match(file, /\.(?:mjs|js|ts|tsx|css|c|h|cs|ps1|json(?:\.gz)?|yml|yaml|md|wat|wasm)$/);
  }
  const caller = new Set(callerFiles), driver = [...new Set(files)];
  const added = driver.filter(file => !caller.has(file));
  const union = [...new Set([...callerFiles, ...driver])];
  assert.ok(union.length <= 256);
  return { files: union, addedDriverFiles: added, driverUniqueSourceFiles: driver.length,
    declaredDriverEntries: files.length, beforeLaunchCoverageVerified: true };
}
