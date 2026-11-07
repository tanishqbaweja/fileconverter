// Historical evidence only. Reverse the reviewed SVG release changes without
// accepting unrelated edits to either historical input.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const pins = {
  "lib/static-host-request-policy.ts": ["be09b39f2cc00ffdb90309bfe2125e3f5bd2406985e6542de54d7fed44221361", "e699ea329425e935279410b7dc3a5bcd0d6ea1b522962f4a128d1ec1b197e4ad"],
  "worker/index.ts": ["837dbca887c0fc78445111c6e4b4ce7eeb833f935e953fd293ea8f1e918fa35c", "427c980ca2d22a309a355f1cb9b1a3fadfb5cecb86cc1d3071530d8117e17c30"],
};

export function reverseReviewedSvgReleaseHost(file, bytes) {
  assert.ok(Object.hasOwn(pins, file), file);
  const [current, historical] = pins[file];
  let source = bytes.toString().replace(/\r\n/g, "\n");
  assert.equal(sha(source), current, file);
  const replace = (after, before = "") => {
    assert.equal(source.split(after).length, 2, after);
    source = source.replace(after, () => before);
  };
  if (file === "worker/index.ts") {
    replace('import { allowSvgQualificationAsset, rejectNonStaticRequest } from "../lib/static-host-request-policy";\n\n// Inlined at build time. Requests and headers cannot enable qualification.\ndeclare const __WITHIN_LOCAL_SVG_QUALIFICATION__: boolean;',
      'import { rejectNonStaticRequest } from "../lib/static-host-request-policy";');
    replace('    const localSvgQualification =\n      typeof __WITHIN_LOCAL_SVG_QUALIFICATION__ !== "undefined" && __WITHIN_LOCAL_SVG_QUALIFICATION__;\n    const rejected = rejectNonStaticRequest(request, localSvgQualification);',
      '    const rejected = rejectNonStaticRequest(request);');
    replace('return withSecurityHeaders(asset,\n        localSvgQualification && allowSvgQualificationAsset(new URL(request.url), true));', 'return withSecurityHeaders(asset);');
    replace('response: Response, qualificationAsset = false', 'response: Response');
    replace('  if (qualificationAsset) headers.set("Cache-Control", "no-store");\n');
  } else {
    replace('request: Request, localSvgQualification = false', 'request: Request');
    replace('  const url = new URL(request.url);\n');
    replace('decodeURIComponent(url.pathname)', 'decodeURIComponent(new URL(request.url).pathname)');
    replace('  if (isSvgQualificationAsset(pathname) && !allowSvgQualificationAsset(url, localSvgQualification)) {\n    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });\n  }\n');
    const suffix = source.indexOf('\n/** Input is decoded once;');
    assert.ok(suffix > 0);
    source = source.slice(0, suffix);
  }
  assert.equal(sha(source), historical, file);
  return Buffer.from(source);
}
