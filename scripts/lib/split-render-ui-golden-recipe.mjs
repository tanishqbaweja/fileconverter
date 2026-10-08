import assert from "node:assert/strict";
import { baselineBinding, makeStableUiHeadlessBaseline, sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeSplitRenderUiGoldens(executed,root,runtime,stamp,binding){
  assert.match(binding.url,/^\/assets\/ConverterApp-[\w-]+\.js$/);assert.ok(binding.bytes>0&&binding.bytes<1048576);
  assert.match(binding.sha256,/^[a-f0-9]{64}$/);assert.notDeepEqual(binding,baselineBinding);
  const baseline=makeStableUiHeadlessBaseline(executed,root,runtime,stamp);
  let spec=baseline.spec;
  const patches=[[JSON.stringify(baselineBinding),JSON.stringify(binding)],
    ['kind: "actual-served-stable-ui-baseline"','kind: "actual-served-split-render-ui-candidate"'],
    [JSON.stringify(stamp+"-baseline-matrix-goldens"),JSON.stringify(stamp+"-split-render-matrix-goldens")]];
  for(const [before,after] of patches){assert.equal(spec.split(before).length,2);spec=spec.replace(before,after);}
  let recovered=spec;for(const [before,after] of patches.toReversed())recovered=recovered.replace(after,before);
  assert.equal(recovered,baseline.spec,"Only binding/kind/artifact prefix changes; all actual conversion/validator/cleanup gates retained");
  assert.ok(spec.includes("headless: true")&&!spec.includes("headless: false"));
  return {spec,driver:baseline.driver,config:baseline.config,
    baselineSpecSha256:sha(baseline.spec),baselineDriverSha256:sha(baseline.driver),patches};
}
