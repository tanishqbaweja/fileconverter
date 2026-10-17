import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeCatalogueSlotReuse(source) {
  assert.equal(sha(source), "8dc2db01d843e00760ca04175f6e9f2e2e1b539466793b0be248bbc41996c6ba");
  const card = source.slice(source.indexOf("          <article "), source.indexOf("          </article>") + "          </article>".length);
  assert.ok(card.includes("data-profile-id={profile.id}"));
  assert.equal(/<(?:input|button|select|textarea|[A-Z])\b|\bon[A-Z]\w*=|\bref=|dangerouslySetInnerHTML/.test(card), false,
    "Positional reuse is only valid for this exact stateless display card");
  const result = exactPatch(source, [
    ['view.profiles.map(profile => (', 'view.profiles.map((profile, slot) => ('],
    ['<article key={profile.id} data-profile-id={profile.id}>', '<article key={slot} data-profile-id={profile.id}>'],
  ]);
  return { ...result, slots: 24, cardBodyChanged: false, searchOrPaginationChanged: false,
    cssChanged: false, conversionControlsChanged: false, publicAcceptance: false };
}

export function deriveCatalogueSlotUiHarness(source, root) {
  const relocated = source.replace(/^(import[^\r\n]*?\bfrom )"(\.[^"\r\n]+)"/gm,
    (_, prefix, file) => prefix + JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href))
    .replace(/^import "(\.[^"\r\n]+)";/gm,
      (_, file) => `import ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)};`);
  const uri = pathToFileURL(path.join(root, "scripts/lib/catalogue-slot-reuse.mjs")).href;
  const observe = `    const slotHandle=await page.evaluateHandle(()=>{
      const nodes=[...document.querySelectorAll(".matrix article")].map(article=>({article,children:[...article.querySelectorAll("*")]}));
      const stats={addedArticles:0,removedArticles:0};
      const observer=new MutationObserver(records=>{for(const record of records){
        for(const node of record.addedNodes)if(node.nodeType===1&&node.tagName==="ARTICLE")stats.addedArticles++;
        for(const node of record.removedNodes)if(node.nodeType===1&&node.tagName==="ARTICLE")stats.removedArticles++;
      }});observer.observe(document.querySelector(".matrix"),{childList:true});return {nodes,stats,observer};
    });
    let reusedArticleComparisons=0,reusedChildComparisons=0;
`;
  const compare = `      const reuse=await slotHandle.evaluate(({nodes})=>{
        const articles=[...document.querySelectorAll(".matrix article")];return {
          articles:articles.length,children:articles.reduce((sum,node)=>sum+node.querySelectorAll("*").length,0),
          sameArticles:articles.every((node,index)=>node===nodes[index].article),
          sameChildren:articles.every((node,index)=>[...node.querySelectorAll("*")].every((child,position)=>child===nodes[index].children[position]))};
      });
      assert.equal(reuse.sameArticles,true);assert.equal(reuse.sameChildren,true);
      if(pages>0){reusedArticleComparisons+=reuse.articles;reusedChildComparisons+=reuse.children;}
`;
  const finish = `    const slotMutations=await slotHandle.evaluate(({stats,observer})=>{observer.disconnect();return stats;});
    assert.equal(slotMutations.addedArticles,0);assert.equal(slotMutations.removedArticles,3);
    await slotHandle.dispose();
`;
  let generated = exactPatch(relocated, [
    ['const root = path.resolve(import.meta.dirname, "..");', `const root = ${JSON.stringify(root)};\nimport {makeCatalogueSlotReuse} from ${JSON.stringify(uri)};`],
    ['for (const file of ["scripts/validate-bounded-catalogue.mjs",',
      'for (const file of ["scripts/lib/catalogue-slot-reuse.mjs","scripts/validate-catalogue-slot-reuse.mjs","tests/catalogue-slot-reuse.test.mjs","scripts/validate-bounded-catalogue.mjs",'],
    ['  assert.ok(componentSource.includes(helper.replaceAll',
      '  const slotRecipe=makeCatalogueSlotReuse(componentSource);result.slotRecipe=slotRecipe;\n  assert.ok(componentSource.includes(helper.replaceAll'],
    ['const js = (await build({ stdin:',
      'const js = (await build({ plugins:[{name:"private-slot-reuse",setup(builder){builder.onLoad({filter:/PublishedFormatsCatalogue\\.tsx$/},()=>({contents:slotRecipe.generated,loader:"tsx"}));}}], stdin:'],
    ['    const observed = [], ids = []; let pages = 0, maxMounted = 0;', observe + '    const observed = [], ids = []; let pages = 0, maxMounted = 0;'],
    ['      pages++; assert.ok(pages <= Math.ceil(profiles.length / 24));', compare + '      pages++; assert.ok(pages <= Math.ceil(profiles.length / 24));'],
    ['    assert.deepEqual(observed, expected,', finish + '    assert.deepEqual(observed, expected,'],
    ['      maxMounted, finalMounted:', '      slotMutations,reusedArticleComparisons,reusedChildComparisons,maxMounted, finalMounted:'],
    ['"passed-component-only-all-routes-exact-bounded-dom"', '"passed-component-only-all-routes-exact-reused-slots"'],
  ]).generated;
  generated = generated.replaceAll('"bounded-catalogue-ui-"', '"catalogue-slot-ui-"')
    .replaceAll('${stamp}-bounded-catalogue-', '${stamp}-catalogue-slot-');
  return { generated, maximumRetainedTestSlots: 24, publicAcceptance: false };
}
