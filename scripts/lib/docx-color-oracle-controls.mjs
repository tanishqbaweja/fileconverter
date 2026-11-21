import assert from "node:assert/strict";

export const DOCX_COLOR_CASES = 14;
export const DOCX_PARAGRAPH_ALIGNMENT_CASES = 6;
export const DOCX_COLOR_ALIGNMENT_FIXTURE_FLAG = "--paragraph-alignment";
export const DOCX_RUN_VERTICAL_FIXTURE_FLAG = "--run-vertical";
// Host operating headroom, separate from the browser memory and repository
// scratch budgets. We do not relocate or remove the user's OS-managed data.
export const DOCX_COLOR_SYSTEM_DISK_MINIMUM_BYTES = 512 * 1024 ** 2;

export function docxColorOracleCases(reference, { checkAlignment = false, checkVertical = false } = {}) {
  assert.ok(!checkVertical || checkAlignment);
  const changed = (name, before, after) => {
    assert.ok(reference.includes(before), `Missing independent validator mutation anchor: ${name}`);
    return [name, reference.replace(before, after), false];
  };
  const cases = [
    ["positive", reference, true],
    changed("changed-unicode-text", "Default α", "Damaged"),
    checkVertical ? changed("lost-emphasis", "<strong><sup>Character style</sup></strong>", "<sup>Character style</sup>")
      : changed("lost-emphasis", "<strong>Character style</strong>", "Character style"),
    checkVertical ? changed("partial-emphasis", "<strong><sup>Character style</sup></strong>", "<sup>Character</sup><strong><sup> style</sup></strong>")
      : changed("partial-emphasis", "<strong>Character style</strong>", "Character<strong> style</strong>"),
    changed("wrong-theme-rgb", "color:#4f81bd", "color:#ffffff"),
    changed("lost-auto-reset", "color:CanvasText", "color:#225544"),
    changed("wrong-tint", "color:#95b3d7", "color:#4f81bd"),
    changed("swapped-color-placement", "color:#225544", "color:#884422"),
    changed("lost-post-payload-text", "After the payload", "Missing tail"),
    changed("active-markup", "</body>", '<img src="https://example.invalid/pixel"></body>'),
    changed("css-injection", "color:#112233", "color:#112233;background:url(https://example.invalid/pixel)"),
  ];
  if (checkAlignment) cases.push(
    changed("lost-inherited-alignment", 'text-align:right"><span style="color:#225544"', 'text-align:left"><span style="color:#225544"'),
    changed("wrong-rtl-trailing-edge", 'text-align:left"><span style="color:#4f81bd"', 'text-align:right"><span style="color:#4f81bd"'),
    changed("wrong-heading-alignment", "white-space:pre-wrap;text-align:justify", "white-space:pre-wrap;text-align:center"),
    changed("reordered-post-payload-rtl-text", "שלום 123 English", "English 123 שלום"),
    changed("direction-override-injection", '<p style="text-align:center">', '<p dir="rtl" style="text-align:center">'),
  );
  if (checkVertical) cases.push(
    changed("lost-default-superscript", "<sup>Default α</sup>", "Default α"),
    changed("swapped-inherited-subscript", "<sub>Inherited paragraph</sub>", "<sup>Inherited paragraph</sup>"),
    changed("lost-baseline-reset", "<strong>Direct override</strong>", "<strong><sup>Direct override</sup></strong>"),
    changed("lost-override-subscript", "<sub>Mapped text1</sub>", "Mapped text1"),
  );
  return cases;
}
