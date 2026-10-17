import assert from "node:assert/strict";

// React SSR inserts empty text-boundary comments; client-only rendering does not.
// Ignore exactly that separator, not whitespace, content, attributes or other comments.
export function normalizeCatalogueCardHtml(html) {
  assert.equal(typeof html, "string"); assert.ok(html.length <= 4096);
  return html.replaceAll("<!-- -->", "");
}
