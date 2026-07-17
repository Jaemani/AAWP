import assert from "node:assert/strict";

export function requiresActionSurface(assertions) {
  return (
    Array.isArray(assertions) &&
    (assertions.includes("action-specific-surface") ||
      assertions.includes("input-preserved-on-error"))
  );
}

export async function locatorByAttribute(page, attribute, value) {
  const candidates = page.locator(`[${attribute}]`);
  for (let index = 0; index < (await candidates.count()); index += 1) {
    const candidate = candidates.nth(index);
    if ((await candidate.getAttribute(attribute)) === value) return candidate;
  }
  return undefined;
}

export async function hasAttributeValue(page, attribute, value) {
  return (await locatorByAttribute(page, attribute, value)) !== undefined;
}

export async function stateSnapshot(page, keys) {
  const entries = await page.locator("[data-aawp-state-key]").evaluateAll((items) =>
    items.map((item) => {
      const key = item.getAttribute("data-aawp-state-key") ?? "";
      const value =
        item instanceof HTMLInputElement ||
        item instanceof HTMLTextAreaElement ||
        item instanceof HTMLSelectElement
          ? item.value
          : item.textContent;
      return [key, value?.trim() ?? ""];
    })
  );
  const observable = new Map();
  for (const [key, value] of entries) {
    if (!observable.has(key)) observable.set(key, value);
  }
  const result = {};
  for (const key of keys) {
    assert.ok(observable.has(key), `browser evidence state key is missing: ${key}`);
    result[key] = observable.get(key);
  }
  return result;
}

export async function fillSurface(surface) {
  const fields = surface.locator("input:not([type=hidden]):not([type=file]), textarea, select");
  for (let index = 0; index < (await fields.count()); index += 1) {
    const field = fields.nth(index);
    if (!(await field.isVisible()) || (await field.isDisabled())) continue;
    const tag = await field.evaluate((element) => element.tagName.toLowerCase());
    const type = (await field.getAttribute("type")) ?? "text";
    if (tag === "select") {
      const options = await field
        .locator("option")
        .evaluateAll((items) =>
          items.map((item) => item.value).filter((value) => value.length > 0)
        );
      if (options[0] !== undefined) await field.selectOption(options[0]);
    } else if (["checkbox", "radio"].includes(type)) {
      await field.check();
    } else if (type === "number") {
      await field.fill("1");
    } else {
      await field.fill("S1 browser evidence");
    }
  }
}

export async function submitActionSurface(surface, actionId) {
  const explicitCandidates = surface.locator("[data-aawp-submit-action]");
  let explicit;
  for (let index = 0; index < (await explicitCandidates.count()); index += 1) {
    const candidate = explicitCandidates.nth(index);
    if (
      (await candidate.getAttribute("data-aawp-submit-action")) === actionId &&
      (await candidate.isVisible())
    ) {
      explicit = candidate;
      break;
    }
  }
  const submit = explicit ?? surface.locator('button[type="submit"], input[type="submit"]').first();
  assert.ok((await submit.count()) > 0, `${actionId} action surface has no submit control`);
  await submit.click();
}

export async function actionSurface(page, action, actionId) {
  let surface = await locatorByAttribute(page, "data-aawp-action-surface", actionId);
  if (surface && (await surface.isVisible())) return surface;
  await action.click();
  surface = await locatorByAttribute(page, "data-aawp-action-surface", actionId);
  return surface;
}

export async function executeAction(action, actionId, surface) {
  if (surface && (await surface.isVisible())) {
    await fillSurface(surface);
    await submitActionSurface(surface, actionId);
    return;
  }
  await action.click();
}
