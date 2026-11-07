import { lstat, readdir, realpath, rmdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import { allowSvgQualificationAsset, isSvgQualificationAsset } from "../lib/static-host-request-policy";

const files = ["build-manifest.json", "resvg.wasm"];
const canonical = (path: string) => process.platform === "win32" ? path.toLowerCase() : path;

export async function enforceSvgBuildAssets(root: string, output: string, qualification: boolean) {
  const expectedOutput = resolve(root, "dist/client");
  if (canonical(resolve(root, output)) !== canonical(expectedOutput)) {
    throw new Error("Unexpected public asset output directory for the SVG release gate.");
  }
  const directory = resolve(expectedOutput, "engines/svg");
  let identity;
  try { identity = await lstat(directory); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && !qualification) return;
    throw error;
  }
  if (!identity.isDirectory() || identity.isSymbolicLink() || canonical(await realpath(directory)) !== canonical(directory)) {
    throw new Error("Refusing to modify a redirected SVG asset output directory.");
  }
  const entries = await readdir(directory, { withFileTypes: true });
  if (entries.length !== files.length || entries.some(entry => !entry.isFile() || !files.includes(entry.name))) {
    throw new Error("Unexpected SVG asset inventory; no files were removed.");
  }
  if (qualification) return;
  // Only these two regular files in the verified generated directory. No
  // recursive operation and no mutation of the retained source/package tree.
  for (const file of files) await unlink(resolve(directory, file));
  await rmdir(directory);
}

export function svgQualificationAssets(qualification: boolean): Plugin {
  let root = process.cwd();
  return {
    name: "within-svg-qualification-assets",
    configResolved(config) { root = config.root; },
    async writeBundle(output) {
      if (this.environment.name !== "client") return;
      if (!output.dir) throw new Error("Missing client output directory for the SVG release gate.");
      await enforceSvgBuildAssets(root, output.dir, qualification);
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let url, decoded;
        try {
          url = new URL(request.url ?? "/", "http://" + (request.headers.host ?? "invalid.invalid"));
          decoded = decodeURIComponent(url.pathname);
        } catch { return next(); }
        if (!isSvgQualificationAsset(decoded)) return next();
        const address = request.socket.remoteAddress;
        const loopback = address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
        if (loopback && allowSvgQualificationAsset(url, qualification)) {
          response.setHeader("Cache-Control", "no-store");
          return next();
        }
        response.statusCode = 404;
        response.setHeader("Cache-Control", "no-store");
        response.end();
      });
    },
  };
}
