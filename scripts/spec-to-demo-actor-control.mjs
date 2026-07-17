import assert from "node:assert/strict";

export async function activateActor(page, actorId) {
  const candidates = page.locator("[data-aawp-actor-id]");
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    const tag = await candidate.evaluate((element) => element.tagName.toLowerCase());
    if (tag === "select") {
      const hasOption = await candidate
        .locator("option")
        .evaluateAll(
          (options, expected) => options.some((option) => option.value === expected),
          actorId
        );
      if (hasOption) {
        await candidate.selectOption(actorId);
        return;
      }
    }
    if (tag === "option" && (await candidate.getAttribute("data-aawp-actor-id")) === actorId) {
      const select = candidate.locator("xpath=parent::select");
      if ((await select.count()) > 0) {
        const value = await candidate.getAttribute("value");
        assert.ok(value, `actor option has no value: ${actorId}`);
        await select.selectOption(value);
        return;
      }
    }
    if ((await candidate.getAttribute("data-aawp-actor-id")) === actorId) {
      await candidate.click();
      return;
    }
  }
  assert.fail(`actor control is missing: ${actorId}`);
}
