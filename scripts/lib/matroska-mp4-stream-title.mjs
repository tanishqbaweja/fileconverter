// Validate the actual Matroska title -> MP4 track-name representation.
// Generic handler_name values are not titles and must never satisfy this check.
import assert from "node:assert/strict";
export function validateMatroskaMp4StreamTitle(sourceTags, outputTags) {
  assert.ok(sourceTags && typeof sourceTags.title === "string" && sourceTags.title.length > 0,
    "Title-bearing fixture/source required; absent values cannot pass by equality");
  const expected = sourceTags.title;
  assert.equal(outputTags?.name, expected, "Preserve exact source title in MP4 track name");
  if (outputTags?.title !== undefined)
    assert.equal(outputTags.title, expected, "Conflicting output title cannot be hidden by track name");
  return { sourceField: "title", outputField: "name", value: expected,
    handlerNameUsedAsTitle: false, exactTextPreserved: true };
}
