import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
      IMAGES: {
        input() {
          throw new Error("Image optimization is not used by this test.");
        },
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the private converter shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Within — private file conversion<\/title>/i);
  assert.match(html, /Big files\./);
  assert.match(html, /Small memory\./);
  assert.match(html, /Nothing is uploaded/);
  assert.match(html, /No PDFs/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("serves cross-origin isolation and restrictive privacy headers", async () => {
  const response = await render();
  assert.equal(response.headers.get("cross-origin-opener-policy"), "same-origin");
  assert.equal(
    response.headers.get("cross-origin-embedder-policy"),
    "require-corp",
  );
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(
    response.headers.get("content-security-policy") ?? "",
    /connect-src 'self'/,
  );
  assert.match(
    response.headers.get("permissions-policy") ?? "",
    /camera=\(\)/,
  );
});
