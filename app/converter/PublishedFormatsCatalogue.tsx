"use client";

// Bounded registry display. This does not certify a conversion's memory budget.
import { memo, useMemo, useState } from "react";
import { formatById } from "../../lib/capability-registry";
import { cataloguePage, CATALOGUE_QUERY_LIMIT } from "../../lib/published-catalogue";

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "Unavailable";
  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export const PublishedFormatsCatalogue = memo(function PublishedFormatsCatalogue() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const view = useMemo(() => cataloguePage(query, page), [query, page]);
  return (
    <section className="formats-section" id="formats" aria-labelledby="catalogue-title">
      <div className="section-intro">
        <p className="eyebrow">Published from the test registry</p>
        <h2 id="catalogue-title">Only verified routes appear.</h2>
        <p>
          Format buttons are generated from the same machine-readable records
          used by the tests. Media routes remain invisible until their custom
          engine passes output validation and the complete browser memory gate.
        </p>
      </div>
      <div className="catalogue-search">
        <label htmlFor="catalogue-query">Search supported formats</label>
        <input id="catalogue-query" type="search" value={query} maxLength={CATALOGUE_QUERY_LIMIT}
          aria-controls="catalogue-results" placeholder="Format, extension, category or route"
          onChange={event => { setQuery(event.currentTarget.value.slice(0, CATALOGUE_QUERY_LIMIT)); setPage(0); }} />
      </div>
      <p role="status" aria-live="polite" aria-atomic="true">
        Showing {view.first}–{view.last} of {view.total} matching routes ({view.publishedTotal} published).
        {view.total ? ` Page ${view.page + 1} of ${view.pages}.` : " No matching routes. Try another search."}
      </p>
      <div className="matrix" id="catalogue-results">
        {/* Display-only slots have no local state; reuse their DOM on pagination. */}
        {view.profiles.map((profile, slot) => (
          <article key={slot} data-profile-id={profile.id}>
            <span>{formatById(profile.input)?.label}</span>
            <b aria-hidden="true">→</b>
            <span>{formatById(profile.output)?.label}</span>
            <small>
              {profile.route} · tested to{" "}
              {profile.maxTestedBytes == null ? "pending" : formatBytes(profile.maxTestedBytes)}
            </small>
          </article>
        ))}
        {!view.publishedTotal ? <div className="matrix-empty">
          Verification is running. No untested conversion is being advertised.
        </div> : null}
      </div>
      <nav className="catalogue-pages" aria-label="Supported format pages">
        <button type="button" disabled={view.page === 0} aria-controls="catalogue-results"
          onClick={() => setPage(view.page - 1)}>Previous formats</button>
        <button type="button" disabled={view.page + 1 >= view.pages || !view.total} aria-controls="catalogue-results"
          onClick={() => setPage(view.page + 1)}>Next formats</button>
      </nav>
    </section>
  );
});
