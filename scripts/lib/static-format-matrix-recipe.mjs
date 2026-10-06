// One reversible frontend optimization, not an engine/registry or memory acceptance change.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const UI_MATRIX_BASELINE_SHA256 = "2dd872f22cc95b3dc5ac66f70ae56ccf4d6da62da165ff4c6e9ce42251c4cf08";
const sha = value => createHash("sha256").update(value).digest("hex");
const begin = '      <section className="formats-section" id="formats">';
const ending = '\n      <footer>';
const main = '  return (\n    <main>';
const prefix = '  // The compiled registry is immutable; progress must not rebuild its static display.\n  const publishedFormatsSection = useMemo(() => (\n';
const suffix = '\n  ), []);\n\n';
const placeholder = '      {publishedFormatsSection}\n';
const once = (source, text) => { assert.equal(source.split(text).length, 2, text); };
export function makeStaticFormatMatrixSource(source) {
  assert.equal(sha(source), UI_MATRIX_BASELINE_SHA256);
  const normalized = source.replaceAll("\r\n", "\n");
  once(normalized, begin); once(normalized, ending); once(normalized, main);
  const section = normalized.slice(normalized.indexOf(begin), normalized.indexOf(ending)).trimEnd();
  const generated = normalized.replace(section, placeholder.trimEnd())
    .replace(main, prefix + section + suffix + main);
  assert.equal(recoverStaticFormatMatrixBaseline(generated), source);
  return generated;
}
export function recoverStaticFormatMatrixBaseline(source) {
  if (sha(source) === UI_MATRIX_BASELINE_SHA256) return source;
  const normalized = source.replaceAll("\r\n", "\n");
  once(normalized, prefix); once(normalized, placeholder); once(normalized, main);
  const start = normalized.indexOf(prefix), end = normalized.indexOf(suffix, start);
  assert.ok(end > start); const section = normalized.slice(start + prefix.length, end);
  assert.ok(section.startsWith(begin) && section.endsWith('      </section>'));
  const definition = prefix + section + suffix;
  once(normalized, definition);
  const recovered = normalized.replace(definition, "").replace(placeholder.trimEnd(), section);
  assert.equal(sha(recovered), UI_MATRIX_BASELINE_SHA256, "Reject all changes beyond exact static-section reuse and line endings");
  return recovered;
}
