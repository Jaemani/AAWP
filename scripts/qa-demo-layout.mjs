import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "playwright";

function values(name) {
  return process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] !== undefined ? [process.argv[index + 1]] : []
  );
}

const url = values("--url")[0];
if (url === undefined) {
  throw new Error(
    "usage: npm run qa:demo-layout -- --url http://127.0.0.1:4173/runs/<runId>/demo-preview/ [--screen screen-id]"
  );
}

const screens = values("--screen");
const targets = screens.length === 0 ? [""] : screens;
const outputDirectory = resolve(values("--output")[0] ?? "tmp/demo-layout-qa");
await mkdir(outputDirectory, { recursive: true });

const browser = await chromium.launch({ headless: true });
const failures = [];
const reports = [];

for (const viewport of [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 }
]) {
  const page = await browser.newPage({ viewport });
  for (const screen of targets) {
    const targetUrl = new URL(url);
    if (screen.length > 0) targetUrl.hash = screen;
    await page.goto(targetUrl.href, { waitUntil: "networkidle" });
    const slug = (screen || "entry").replaceAll(/[^A-Za-z0-9_-]/g, "-");
    await page.screenshot({
      path: resolve(outputDirectory, `${viewport.name}-${slug}.png`),
      fullPage: true
    });

    const report = await page.evaluate(() => {
      const visible = (element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== "hidden"
        );
      };
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          tag: element.tagName.toLowerCase(),
          type: element.getAttribute("type"),
          width: Number(rect.width.toFixed(2)),
          height: Number(rect.height.toFixed(2)),
          padding: style.padding,
          lineHeight: style.lineHeight,
          appearance: style.appearance
        };
      };
      const controls = [...document.querySelectorAll("input:not([type=hidden]), select, textarea")]
        .filter(visible)
        .map(box);
      const singleLineHeights = controls
        .filter((control) => ["input", "select"].includes(control.tag))
        .map((control) => control.height);
      const controlHeightDelta =
        singleLineHeights.length < 2
          ? 0
          : Math.max(...singleLineHeights) - Math.min(...singleLineHeights);

      const hasHorizontalScroller = (element) => {
        let current = element.parentElement;
        while (current !== null) {
          const overflow = getComputedStyle(current).overflowX;
          if (["auto", "scroll"].includes(overflow)) return true;
          current = current.parentElement;
        }
        return false;
      };
      const overflow = [...document.querySelectorAll("body *")]
        .filter(visible)
        .filter((element) => {
          const style = getComputedStyle(element);
          const ownOverflow =
            element.scrollWidth > element.clientWidth + 1 &&
            !["auto", "scroll"].includes(style.overflowX);
          const viewportOverflow =
            element.getBoundingClientRect().right > document.documentElement.clientWidth + 1 &&
            !hasHorizontalScroller(element);
          return ownOverflow || viewportOverflow;
        })
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          className: String(element.className),
          text: (element.textContent ?? "").trim().replaceAll(/\s+/g, " ").slice(0, 80),
          clientWidth: element.clientWidth,
          scrollWidth: element.scrollWidth,
          right: Number(element.getBoundingClientRect().right.toFixed(2))
        }));

      const fields = [...document.querySelectorAll("input, select, textarea")].filter(visible);
      const buttons = [...document.querySelectorAll("button, [role=button]")].filter(visible);
      const overlap = [];
      for (const field of fields) {
        const fieldRect = field.getBoundingClientRect();
        for (const button of buttons) {
          const buttonRect = button.getBoundingClientRect();
          const width =
            Math.min(fieldRect.right, buttonRect.right) - Math.max(fieldRect.left, buttonRect.left);
          const height =
            Math.min(fieldRect.bottom, buttonRect.bottom) - Math.max(fieldRect.top, buttonRect.top);
          if (width > 1 && height > 1)
            overlap.push({
              field: field.tagName.toLowerCase(),
              button: (button.textContent ?? "").trim()
            });
        }
      }

      const actionGaps = [...document.querySelectorAll(".action-bar")]
        .filter(visible)
        .map((action) => {
          const previous = action.previousElementSibling;
          return previous === null
            ? null
            : Number(
                (
                  action.getBoundingClientRect().top - previous.getBoundingClientRect().bottom
                ).toFixed(2)
              );
        })
        .filter((gap) => gap !== null);
      return { controls, controlHeightDelta, overflow, overlap, actionGaps };
    });

    const key = `${viewport.name}:${screen || "entry"}`;
    reports.push({ key, ...report });
    if (report.controlHeightDelta >= 1)
      failures.push(`${key} input/select height delta ${report.controlHeightDelta}px`);
    if (report.overflow.length > 0)
      failures.push(`${key} unintended overflow ${JSON.stringify(report.overflow)}`);
    if (report.overlap.length > 0)
      failures.push(`${key} field/action overlap ${JSON.stringify(report.overlap)}`);
    if (report.actionGaps.some((gap) => gap < 16))
      failures.push(`${key} action gap below 16px ${report.actionGaps.join(",")}`);
  }
  await page.close();
}

await browser.close();
process.stdout.write(
  `${JSON.stringify({ ok: failures.length === 0, reports, failures }, null, 2)}\n`
);
if (failures.length > 0) process.exitCode = 1;
