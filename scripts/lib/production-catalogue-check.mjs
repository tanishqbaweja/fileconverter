// Static public-registry UI only. Never accepts files, handles or media bytes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
export async function verifyProductionCatalogue(page, expected, screenshotDirectory) {
  assert.ok(expected.length > 0 && expected.length <= 4096);
  const originalViewport = page.viewportSize(), cases = [];
  const cards = page.locator("#catalogue-results article");
  const next = page.getByRole("button", { name: "Next formats", exact: true });
  const previous = page.getByRole("button", { name: "Previous formats", exact: true });
  const search = page.getByRole("searchbox", { name: "Search supported formats", exact: true });
  try {
    for (const viewport of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport); await search.waitFor(); await search.fill("");
      await page.waitForFunction(() => document.querySelector("#formats [role=status]")?.textContent.includes("Page 1 of"));
      // Element handles cannot be serialized across CDP; retain at most24 actual
      // DOM identities inside one handle, dispose before accepting user input.
      assert.equal(await cards.count(), 24);
      const identities = await page.evaluateHandle(() => {
        const nodes = [...document.querySelectorAll("#catalogue-results article")].map(article => ({ article, children: [...article.children] }));
        const counts = { added: 0, removed: 0 };
        const observer = new MutationObserver(records => { for (const record of records) {
          for (const node of record.addedNodes) if (node.nodeType === 1 && node.nodeName === "ARTICLE") counts.added++;
          for (const node of record.removedNodes) if (node.nodeType === 1 && node.nodeName === "ARTICLE") counts.removed++;
        } });
        observer.observe(document.querySelector("#catalogue-results"), { childList: true }); return { nodes, counts, observer };
      });
      const ids = []; let pages = 0, maximumMounted = 0, mutations;
      try {
        for (;;) {
          const view = await cards.evaluateAll(nodes => nodes.map(node => ({ id: node.dataset.profileId,
            input: node.querySelector("span:first-child").textContent, output: node.querySelector("span:nth-child(3)").textContent,
            detail: node.querySelector("small").textContent })));
          assert.ok(view.length > 0 && view.length <= 24); maximumMounted = Math.max(maximumMounted, view.length);
          for (const [index, item] of view.entries()) {
            const profile = expected[ids.length + index]; assert.equal(item.id, profile.id);
            assert.equal(item.input, profile.inputLabel); assert.equal(item.output, profile.outputLabel);
            assert.ok(item.detail.includes(profile.route + " · tested to"));
          }
          ids.push(...view.map(item => item.id)); assert.ok(ids.length <= expected.length);
          const reused = await identities.evaluate(({ nodes }) => [...document.querySelectorAll("#catalogue-results article")].every((article, index) =>
            article === nodes[index].article && [...article.children].every((child, position) => child === nodes[index].children[position])));
          assert.equal(reused, true, "Pagination must reuse stateless article and child slots");
          pages++; assert.ok(pages <= Math.ceil(expected.length / 24));
          if (await next.isDisabled()) break;
          await next.focus(); await page.keyboard.press("Enter");
          await page.waitForFunction(page => document.querySelector("#formats [role=status]")?.textContent.includes(`Page ${page} of`), pages + 1);
        }
        mutations = await identities.evaluate(({ counts, observer }) => { observer.disconnect(); return counts; });
        assert.equal(mutations.added, 0); assert.equal(mutations.removed, 24 - (expected.length % 24 || 24));
      } finally { await identities.evaluate(({ observer }) => observer.disconnect()); await identities.dispose(); }
      assert.deepEqual(ids, expected.map(profile => profile.id));
      await previous.click();
      await page.waitForFunction(page => document.querySelector("#formats [role=status]")?.textContent.includes(`Page ${page} of`), pages - 1);
      await search.fill("  PNG  ");
      await page.waitForFunction(() => document.querySelector("#formats [role=status]")?.textContent.includes("Page 1 of"));
      assert.equal(await previous.isDisabled(), true); assert.ok(await cards.count() > 0);
      await search.fill("NO_MATCH_音楽");
      await page.waitForFunction(() => document.querySelector("#formats [role=status]")?.textContent.includes("No matching routes"));
      assert.equal(await cards.count(), 0); assert.equal(await next.isDisabled(), true);
      await search.fill(expected.at(-1).id); await page.locator(`[data-profile-id="${expected.at(-1).id}"]`).waitFor();
      await search.fill("");
      await page.waitForFunction(() => document.querySelector("#formats [role=status]")?.textContent.includes("Page 1 of"));
      assert.equal(await cards.count(), 24);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), true);
      await page.locator("#catalogue-title").scrollIntoViewIfNeeded();
      const screenshot = path.join(screenshotDirectory, `catalogue-${viewport.width}x${viewport.height}.png`);
      await page.screenshot({ path: screenshot });
      cases.push({ viewport, routes: ids.length, pages, maximumMounted, mutations, keyboardNavigation: true,
        searchEmptyExactAndReset: true, noHorizontalOverflow: true, screenshot,
        routeIdsSha256: createHash("sha256").update(JSON.stringify(ids)).digest("hex") });
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
    await page.getByRole("link", { name: "Within home", exact: true }).click();
  }
  return { scope: "actual-production-registry-UI-not-conversion-acceptance", cases };
}
