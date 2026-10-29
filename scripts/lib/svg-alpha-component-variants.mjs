// Predeclared additional components, not edits to any user SVG or original6M test.
import assert from "node:assert/strict";
import { sha } from "../../images/resvg-source/source-pins.mjs";
import { svgFilteredAlphaControlPin } from "./svg-strip-filtered-alpha-control.mjs";
export function svgAlphaComponentVariants(bytes) {
  assert.equal(bytes.length, svgFilteredAlphaControlPin.bytes); assert.equal(sha(bytes), svgFilteredAlphaControlPin.sha256);
  const original = bytes.toString(), filter = '<g filter="url(#bounded-shadow)">';
  assert.equal(original.split(filter).length, 2);
  const noFilter = original.replace(filter, "<g>");
  const square = source => {
    let count = 0;
    const value = source.replace(/(<rect\b[^>]*?) rx="10"/g, (_all, prefix) => { count++; return prefix; });
    assert.equal(count, 144);
    assert.equal(value.replace(/(<rect x="\d+" y="\d+" width="5[678]" height="5[678]")/g, '$1 rx="10"'), source);
    return value;
  };
  const tiles = [...original.matchAll(/<rect x="(\d+)" y="(\d+)" width="(5[678])" height="(5[678])" rx="10"/g)];
  assert.equal(tiles.length, 144);
  const sampleCoordinates = tiles.slice(0, 16).flatMap((match) => {
    const [x, y, w, h] = match.slice(1).map(Number);
    return [{ kind: "center", x: x + Math.floor(w / 2), y: y + Math.floor(h / 2) },
      { kind: "rounded-corner", x: x + 3, y: y + 3 }, { kind: "top-edge", x: x + 10, y },
      { kind: "shadow-gap", x: x + w + 1, y: y + Math.floor(h / 2) }];
  });
  return [
    ["rounded-no-filter", noFilter, { filterUseRemoved: 1, roundedRadiiRemoved: 0 }, "If alpha still differs, filtering is not necessary for the mismatch", true],
    ["square-no-filter", square(noFilter), { filterUseRemoved: 1, roundedRadiiRemoved: 144 }, "Integer-edge coverage control should have no partial alpha and exact alpha equality", false],
    ["square-filtered", square(original), { filterUseRemoved: 0, roundedRadiiRemoved: 144 }, "Remaining alpha differences implicate filtering beyond rounded-geometry coverage", true],
  ].map(([name, source, changes, hypothesis, expectPartialAlpha]) => ({ name, source, bytes: Buffer.byteLength(source), sha256: sha(source),
    changes, hypothesis, expectPartialAlpha, sampleCoordinates }));
}
export function assertSvgAlphaComponentsNotCompleted(ledger, nativeWasmSha256, variants) {
  assert.match(nativeWasmSha256, /^[a-f0-9]{64}$/); assert.equal(variants.length, 3);
  const pins = variants.map(({ name, sha256 }) => ({ name, sha256 }));
  const done = ledger.completedPremultipliedAlphaComponents;
  assert.ok(!(done?.nativeWasmSha256 === nativeWasmSha256 && JSON.stringify(done.variants) === JSON.stringify(pins)),
    "These exact alpha components are already complete; inspect " + done?.evidence + " instead of replaying them");
}
