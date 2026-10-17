import assert from "node:assert/strict";
import { makeMemoizedCacheApp } from "./memoized-cache-candidate.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";

export const CATALOGUE_CSS = `
.catalogue-search{display:grid;gap:.6rem;max-width:32rem;margin-top:2rem}
.catalogue-search input{background:#252824;color:#f4f1e9;border:1px solid #74786e;border-radius:.6rem;padding:.8rem;width:100%;min-width:0}
.catalogue-search input:focus-visible,.catalogue-pages button:focus-visible{outline:3px solid var(--coral);outline-offset:3px}
.catalogue-pages{display:flex;flex-wrap:wrap;gap:1rem;margin-top:1.5rem}
.catalogue-pages button{padding:.7rem 1rem;border:1px solid #74786e;border-radius:.6rem;background:#252824;color:#f4f1e9;cursor:pointer}
.catalogue-pages button:disabled{opacity:.5;cursor:default}
#catalogue-results{margin-top:1.5rem}
`;

export function makeBoundedCatalogueApp(app) {
  const parent = makeMemoizedCacheApp(app);
  const begin = "  const publishedFormatsSection = useMemo(() => (";
  const start = parent.generated.indexOf(begin), end = parent.generated.indexOf("\n  ), []);", start) + "\n  ), []);".length;
  assert.ok(start > 0 && end > start);
  const original = parent.generated.slice(start, end);
  assert.equal((original.match(/<article /g) ?? []).length, 1);
  assert.ok(original.includes('profile.public && profile.automatedTestStatus === "passed"'));
  const edits = [
    ['"use client";', '"use client";\nimport { PublishedFormatsCatalogue } from "./PublishedFormatsCatalogue";'],
    [original, "  const publishedFormatsSection = <PublishedFormatsCatalogue />;"],
  ];
  return { ...exactPatch(parent.generated, edits), originalSection: original, maximumMountedCards: 24,
    allRegistryRoutesRetained: true, conversionSettingsChanged: false, publicAcceptance: false };
}
