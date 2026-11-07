import handler from "vinext/server/app-router-entry";
import { allowSvgQualificationAsset, rejectNonStaticRequest } from "../lib/static-host-request-policy";

// Inlined at build time. Requests and headers cannot enable qualification.
declare const __WITHIN_LOCAL_SVG_QUALIFICATION__: boolean;

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: Fetcher;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const localSvgQualification =
      typeof __WITHIN_LOCAL_SVG_QUALIFICATION__ !== "undefined" && __WITHIN_LOCAL_SVG_QUALIFICATION__;
    const rejected = rejectNonStaticRequest(request, localSvgQualification);
    if (rejected) return withSecurityHeaders(rejected);
    // Worker-first routing must explicitly forward static reads. This Vinext
    // version does not resolve every generated /assets URL on its own.
    if (env.ASSETS) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return withSecurityHeaders(asset,
        localSvgQualification && allowSvgQualificationAsset(new URL(request.url), true));
    }
    return withSecurityHeaders(await handler.fetch(request, env, ctx));
  },
};

function withSecurityHeaders(response: Response, qualificationAsset = false): Response {
  const headers = new Headers(response.headers);
  if (qualificationAsset) headers.set("Cache-Control", "no-store");
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("Origin-Agent-Cluster", "?1");
  headers.set("Referrer-Policy", "no-referrer");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=()",
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:; object-src 'none'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:",
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default worker;
