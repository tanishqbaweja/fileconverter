// The host serves the application and engines, never user-data submissions or
// server-side image transformations. Do not read a rejected request's body.
export function rejectNonStaticRequest(request: Request, localSvgQualification = false): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  const url = new URL(request.url);
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname).replace(/\/+$/, "");
  } catch {
    return new Response(null, { status: 400 });
  }
  if (pathname === "/_vinext/image" || pathname === "/_next/image") {
    return new Response(null, { status: 404 });
  }
  if (isSvgQualificationAsset(pathname) && !allowSvgQualificationAsset(url, localSvgQualification)) {
    return new Response(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return null;
}

/** Input is decoded once; account for encoded separators and dot segments. */
export function isSvgQualificationAsset(pathname: string): boolean {
  const segments: string[] = [];
  for (const segment of pathname.replaceAll("\\", "/").split("/")) {
    if (segment === "..") segments.pop();
    else if (segment && segment !== ".") segments.push(segment);
  }
  return segments[0]?.toLowerCase() === "engines" && segments[1]?.toLowerCase() === "svg";
}

export function allowSvgQualificationAsset(url: URL, enabled: boolean): boolean {
  return enabled && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]") &&
    (url.pathname === "/engines/svg/resvg.wasm" || url.pathname === "/engines/svg/build-manifest.json");
}
