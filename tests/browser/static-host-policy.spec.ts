import { expect, test } from "@playwright/test";

test("production worker refuses submissions and server image conversion while serving the app", async ({ request }) => {
  for (const pathname of ["/_vinext/image", "/_next/image", "/%5Fvinext/%69mage", "/_next/image/"]) {
    const response = await request.get(pathname + "?url=%2Ficon.svg&w=640&q=80");
    expect(response.status()).toBe(404);
    expect(response.headers()["cross-origin-opener-policy"]).toBe("same-origin");
    expect(response.headers()["cross-origin-embedder-policy"]).toBe("require-corp");
    expect(await response.text()).toBe("");
  }
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
    // Synthetic refusal control on localhost, never a selected file or filename.
    const response = await request.fetch("/", { method, data: "synthetic-control-only" });
    expect(response.status()).toBe(405); expect(response.headers().allow).toBe("GET, HEAD");
    expect(await response.text()).toBe("");
  }
  const page = await request.get("/");
  expect(page.status()).toBe(200); expect(await page.text()).toContain("Big files.");
  expect((await request.head("/")).status()).toBe(200);
});
