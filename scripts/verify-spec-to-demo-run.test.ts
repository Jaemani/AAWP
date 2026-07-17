import { chromium } from "playwright";
import { describe, expect, it } from "vitest";
// @ts-expect-error -- the actor control helper is a repository ESM script.
import { activateActor } from "./spec-to-demo-actor-control.mjs";

describe("spec-to-demo actor activation", () => {
  it("selects an actor when stable actor ids are declared on option elements", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.setContent(`
        <label>
          Demo 역할 보기
          <select id="actor">
            <option value="operator" data-aawp-actor-id="operator">작성자</option>
            <option value="approver" data-aawp-actor-id="approver">결재자</option>
          </select>
        </label>
      `);

      await activateActor(page, "approver");

      await expect(page.locator("#actor").inputValue()).resolves.toBe("approver");
    } finally {
      await browser.close();
    }
  });
});
