import assert from "node:assert/strict";

export const DOCX_COLOR_CASES = 14;
// Host operating headroom, separate from the browser memory and repository
// scratch budgets. We do not relocate or remove the user's OS-managed data.
export const DOCX_COLOR_SYSTEM_DISK_MINIMUM_BYTES = 512 * 1024 ** 2;

export function docxColorOracleCases(reference) {
  const changed = (name, before, after) => {
    assert.ok(reference.includes(before), `Missing independent validator mutation anchor: ${name}`);
    return [name, reference.replace(before, after), false];
  };
  return [
    ["positive", reference, true],
    changed("changed-unicode-text", "Default α", "Damaged"),
    changed("lost-emphasis", "<strong>Character style</strong>", "Character style"),
    changed("partial-emphasis", "<strong>Character style</strong>", "Character<strong> style</strong>"),
    changed("wrong-theme-rgb", "color:#4f81bd", "color:#ffffff"),
    changed("lost-auto-reset", "color:CanvasText", "color:#225544"),
    changed("wrong-tint", "color:#95b3d7", "color:#4f81bd"),
    changed("swapped-color-placement", "color:#225544", "color:#884422"),
    changed("lost-post-payload-text", "After the payload", "Missing tail"),
    changed("active-markup", "</body>", '<img src="https://example.invalid/pixel"></body>'),
    changed("css-injection", "color:#112233", "color:#112233;background:url(https://example.invalid/pixel)"),
  ];
}
