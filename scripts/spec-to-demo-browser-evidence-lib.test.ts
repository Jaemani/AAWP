import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
// @ts-expect-error -- repository browser evidence helpers are plain ESM.
import {
  executeAction,
  hasAttributeValue,
  locatorByAttribute,
  requiresActionSurface,
  stateSnapshot,
  submitActionSurface
} from "./spec-to-demo-browser-evidence-lib.mjs";

describe("spec-to-demo browser evidence command execution", () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
  });

  afterAll(async () => {
    await browser.close();
  });

  it("treats error-preservation evidence as an implicit action surface contract", () => {
    expect(requiresActionSurface(["visible", "input-preserved-on-error"])).toBe(true);
    expect(requiresActionSurface(["visible", "state-change"])).toBe(false);
  });

  it("submits a visible action surface exactly once", async () => {
    await page.setContent(`
      <div data-aawp-action-surface="save">
        <input value="" />
        <button type="button" data-aawp-action-id="save" data-aawp-submit-action="save">Save</button>
      </div>
      <span data-aawp-state-key="version">0</span>
      <script>
        window.submitCount = 0;
        document.querySelector('[data-aawp-submit-action="save"]').addEventListener('click', () => {
          window.submitCount += 1;
          document.querySelector('[data-aawp-state-key="version"]').textContent = String(window.submitCount);
        });
      </script>
    `);
    const action = page.locator('[data-aawp-action-id="save"]');
    const surface = await locatorByAttribute(page, "data-aawp-action-surface", "save");
    await executeAction(action, "save", surface);
    expect(
      await page.evaluate(() => (window as Window & { submitCount: number }).submitCount)
    ).toBe(1);
    expect(await stateSnapshot(page, ["version"])).toEqual({ version: "1" });
  });

  it("never selects a same-id submit control outside the declared surface", async () => {
    await page.setContent(`
      <button data-aawp-submit-action="approve" id="outside">Outside</button>
      <div data-aawp-action-surface="approve">
        <button data-aawp-submit-action="approve" id="inside">Inside</button>
      </div>
      <script>
        window.clicked = [];
        document.querySelectorAll('button').forEach((button) => button.addEventListener('click', () => window.clicked.push(button.id)));
      </script>
    `);
    const surface = await locatorByAttribute(page, "data-aawp-action-surface", "approve");
    await submitActionSurface(surface, "approve");
    expect(await page.evaluate(() => (window as Window & { clicked: string[] }).clicked)).toEqual([
      "inside"
    ]);
  });

  it("reports duplicate evidence as a boolean without exposing a Playwright Locator", async () => {
    await page.setContent(`<div data-aawp-duplicate-blocked="submit"></div>`);

    expect(await hasAttributeValue(page, "data-aawp-duplicate-blocked", "submit")).toBe(true);
    expect(await hasAttributeValue(page, "data-aawp-duplicate-blocked", "other")).toBe(false);
  });
});
