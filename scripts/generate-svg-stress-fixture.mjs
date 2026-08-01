import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { stdout } = await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-svg-stress-fixture.py")],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
process.stdout.write(stdout);
