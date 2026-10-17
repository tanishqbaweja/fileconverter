import { conversionProfiles, formatById, type ConversionProfile } from "./capability-registry";

export const CATALOGUE_PAGE_SIZE = 24;
export const CATALOGUE_QUERY_LIMIT = 128;
// Immutable registry metadata only: never filenames, file handles or conversion data.
const published = conversionProfiles.filter(profile => profile.public && profile.automatedTestStatus === "passed");
const entries = published.map(profile => ({
  profile,
  search: [profile.id, profile.input, profile.output, profile.route,
    ...[profile.input, profile.output].flatMap(id => {
      const format = formatById(id);
      return format ? [format.label, format.category, ...format.extensions] : [];
    })].join(" ").toLowerCase(),
}));

export function cataloguePage(query: string, requestedPage: number): {
  profiles: readonly ConversionProfile[]; total: number; publishedTotal: number;
  page: number; pages: number; first: number; last: number;
} {
  const words = query.slice(0, CATALOGUE_QUERY_LIMIT).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const matches = words.length ? entries.filter(entry => words.every(word => entry.search.includes(word))) : entries;
  const pages = Math.max(1, Math.ceil(matches.length / CATALOGUE_PAGE_SIZE));
  const page = Math.max(0, Math.min(pages - 1, Number.isFinite(requestedPage) ? Math.floor(requestedPage) : 0));
  const start = page * CATALOGUE_PAGE_SIZE;
  return { profiles: matches.slice(start, start + CATALOGUE_PAGE_SIZE).map(entry => entry.profile),
    total: matches.length, publishedTotal: published.length, page, pages,
    first: matches.length ? start + 1 : 0, last: Math.min(start + CATALOGUE_PAGE_SIZE, matches.length) };
}
