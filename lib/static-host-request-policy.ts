// The host serves the application and engines, never user-data submissions or
// server-side image transformations. Do not read a rejected request's body.
export function rejectNonStaticRequest(request: Request): Response | null {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(request.url).pathname).replace(/\/+$/, "");
  } catch {
    return new Response(null, { status: 400 });
  }
  if (pathname === "/_vinext/image" || pathname === "/_next/image") {
    return new Response(null, { status: 404 });
  }
  return null;
}
