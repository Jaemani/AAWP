import { mkdir, readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

export const DEMO_QA_VIEWPORTS = [
  { name: "desktop", width: 1440, height: 1100 },
  { name: "mobile", width: 390, height: 844 }
];

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".woff2", "font/woff2"]
]);

export async function startStaticDemoServer(directory) {
  const root = resolve(directory);
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://local").pathname);
      let target = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
      if (target !== root && !target.startsWith(`${root}${sep}`)) {
        response.writeHead(403).end("forbidden");
        return;
      }
      if ((await stat(target)).isDirectory()) target = resolve(target, "index.html");
      const content = await readFile(target);
      response.writeHead(200, {
        "content-type":
          CONTENT_TYPES.get(extname(target).toLowerCase()) ?? "application/octet-stream",
        "cache-control": "no-store"
      });
      response.end(content);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
      response
        .writeHead(code === "ENOENT" ? 404 : 500)
        .end(code === "ENOENT" ? "not found" : "error");
    }
  });
  await new Promise((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("static server has no port");
  return {
    url: `http://127.0.0.1:${address.port}/`,
    close: () =>
      new Promise((resolveClosed, rejectClosed) =>
        server.close((error) => (error === undefined ? resolveClosed() : rejectClosed(error)))
      )
  };
}

export async function runDemoLayoutQa({
  url,
  screens = [""],
  outputDirectory,
  takeScreenshots = true,
  maxPageHeight = {},
  forbiddenVisibleText = [],
  requiredPanelCount,
  expectedControlHeight,
  requiredPanelLayoutByScreen = {},
  requiredRailBackground,
  requiredVisibleText = [],
  requiredVisibleRoutes = []
}) {
  if (takeScreenshots) {
    if (outputDirectory === undefined)
      throw new Error("outputDirectory is required for screenshots");
    await mkdir(resolve(outputDirectory), { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const failures = [];
  const reports = [];
  try {
    for (const viewport of DEMO_QA_VIEWPORTS) {
      const page = await browser.newPage({ viewport });
      try {
        for (const screen of screens.length === 0 ? [""] : screens) {
          const targetUrl = new URL(url);
          if (screen.length > 0) targetUrl.hash = screen;
          await page.goto("about:blank");
          const response = await page.goto(targetUrl.href, { waitUntil: "networkidle" });
          if (takeScreenshots) {
            const slug = (screen || "entry").replaceAll(/[^A-Za-z0-9_-]/g, "-");
            await page.screenshot({
              path: resolve(outputDirectory, `${viewport.name}-${slug}.png`),
              fullPage: true
            });
          }

          const report = await page.evaluate(
            ({ forbiddenText, requiredRoutes }) => {
              const visible = (element) => {
                const rect = element.getBoundingClientRect();
                const style = getComputedStyle(element);
                return (
                  rect.width > 0 &&
                  rect.height > 0 &&
                  style.visibility !== "hidden" &&
                  style.display !== "none" &&
                  style.clipPath === "none" &&
                  style.clip === "auto"
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
              const controls = [
                ...document.querySelectorAll("input:not([type=hidden]), select, textarea")
              ]
                .filter(visible)
                .map(box);
              const wrappedFinancialMetrics = [
                ...document.querySelectorAll(".metrics strong, .metric strong, [data-metric-value]")
              ]
                .filter(visible)
                .filter((element) => /\d[\d,]*원/u.test(element.textContent ?? ""))
                .filter((element) => {
                  const lineHeight = Number.parseFloat(getComputedStyle(element).lineHeight);
                  return (
                    Number.isFinite(lineHeight) &&
                    element.getBoundingClientRect().height > lineHeight * 1.5
                  );
                })
                .map((element) => ({
                  text: (element.textContent ?? "").trim(),
                  height: Number(element.getBoundingClientRect().height.toFixed(2)),
                  lineHeight: getComputedStyle(element).lineHeight
                }));
              const singleLineHeights = controls
                .filter(
                  (control) =>
                    control.tag === "select" ||
                    (control.tag === "input" &&
                      !["checkbox", "radio", "range", "file", "color"].includes(
                        control.type ?? "text"
                      ))
                )
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
                    element.getBoundingClientRect().right >
                      document.documentElement.clientWidth + 1 && !hasHorizontalScroller(element);
                  return ownOverflow || viewportOverflow;
                })
                .slice(0, 12)
                .map((element) => ({
                  tag: element.tagName.toLowerCase(),
                  className: String(element.className),
                  text: (element.textContent ?? "").trim().replaceAll(/\s+/g, " ").slice(0, 80),
                  clientWidth: element.clientWidth,
                  scrollWidth: element.scrollWidth,
                  right: Number(element.getBoundingClientRect().right.toFixed(2))
                }));

              const fields = [...document.querySelectorAll("input, select, textarea")].filter(
                visible
              );
              const buttons = [...document.querySelectorAll("button, [role=button]")].filter(
                visible
              );
              const textGlyphNavigation = [
                ...document.querySelectorAll(
                  "nav button, nav a, [role=navigation] button, [role=navigation] a"
                )
              ]
                .filter(visible)
                .filter((element) => !element.querySelector("img, svg, use, [data-icon]"))
                .map((element) => (element.textContent ?? "").trim())
                .filter((label) => /[☰≡→←▶▷…⋯票]/u.test(label));
              const routeLinks = [
                ...document.querySelectorAll("nav a[href], [role=navigation] a[href]")
              ].filter(visible);
              const fullyExposedHorizontally = (element) => {
                const rect = element.getBoundingClientRect();
                if (rect.left < -1 || rect.right > document.documentElement.clientWidth + 1)
                  return false;
                let current = element.parentElement;
                while (current !== null) {
                  const style = getComputedStyle(current);
                  if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) {
                    const parentRect = current.getBoundingClientRect();
                    if (rect.left < parentRect.left - 1 || rect.right > parentRect.right + 1)
                      return false;
                  }
                  current = current.parentElement;
                }
                return true;
              };
              const routeVisibility = requiredRoutes.map((route) => {
                const links = routeLinks.filter((element) => {
                  try {
                    return (
                      new URL(element.getAttribute("href") ?? "", location.href).hash ===
                      `#${route}`
                    );
                  } catch {
                    return false;
                  }
                });
                return {
                  route,
                  visible: links.some(fullyExposedHorizontally),
                  labels: links.map((element) => (element.textContent ?? "").trim())
                };
              });
              const overlap = [];
              for (const field of fields) {
                const fieldRect = field.getBoundingClientRect();
                for (const button of buttons) {
                  const buttonRect = button.getBoundingClientRect();
                  const width =
                    Math.min(fieldRect.right, buttonRect.right) -
                    Math.max(fieldRect.left, buttonRect.left);
                  const height =
                    Math.min(fieldRect.bottom, buttonRect.bottom) -
                    Math.max(fieldRect.top, buttonRect.top);
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
                  if (previous === null) return null;
                  const style = getComputedStyle(action);
                  return {
                    gap: Number(
                      (
                        action.getBoundingClientRect().top - previous.getBoundingClientRect().bottom
                      ).toFixed(2)
                    ),
                    divided:
                      Number.parseFloat(style.borderTopWidth) >= 1 &&
                      style.borderTopStyle !== "none" &&
                      style.borderTopColor !== "rgba(0, 0, 0, 0)"
                  };
                })
                .filter((measurement) => measurement !== null);
              const visiblePageText = (document.body.innerText ?? "").toLocaleLowerCase("en-US");
              const rail = [...document.querySelectorAll(".rail")].find(visible);
              return {
                controls,
                wrappedFinancialMetrics,
                singleLineHeights,
                controlHeightDelta,
                overflow,
                overlap,
                textGlyphNavigation,
                routeVisibility,
                actionGaps,
                panelCount: [...document.querySelectorAll(".panel")].filter(visible).length,
                panelRoles: [...document.querySelectorAll("[data-panel-role]")]
                  .filter(visible)
                  .map((element) => {
                    const rect = element.getBoundingClientRect();
                    return {
                      role: element.getAttribute("data-panel-role"),
                      left: Number(rect.left.toFixed(2)),
                      top: Number(rect.top.toFixed(2)),
                      right: Number(rect.right.toFixed(2)),
                      bottom: Number(rect.bottom.toFixed(2))
                    };
                  }),
                railBackground: rail === undefined ? null : getComputedStyle(rail).backgroundColor,
                forbiddenTextMatches: forbiddenText.filter((value) =>
                  visiblePageText.includes(value.toLocaleLowerCase("en-US"))
                ),
                visiblePageText,
                pageHeight: document.documentElement.scrollHeight,
                viewportWidth: document.documentElement.clientWidth,
                documentWidth: document.documentElement.scrollWidth
              };
            },
            { forbiddenText: forbiddenVisibleText, requiredRoutes: requiredVisibleRoutes }
          );

          const key = `${viewport.name}:${screen || "entry"}`;
          reports.push({ key, ...report });
          if (response === null || !response.ok())
            failures.push(`${key} navigation status ${response?.status() ?? "unavailable"}`);
          if (report.controlHeightDelta >= 1)
            failures.push(`${key} input/select height delta ${report.controlHeightDelta}px`);
          if (report.wrappedFinancialMetrics.length > 0)
            failures.push(
              `${key} wrapped financial metrics ${JSON.stringify(report.wrappedFinancialMetrics)}`
            );
          if (
            expectedControlHeight !== undefined &&
            report.singleLineHeights.some((height) => Math.abs(height - expectedControlHeight) >= 1)
          )
            failures.push(
              `${key} input/select heights ${report.singleLineHeights.join(",")} != ${expectedControlHeight}px`
            );
          if (report.documentWidth > viewport.width + 1)
            failures.push(`${key} document width ${report.documentWidth}px > ${viewport.width}px`);
          if (report.overflow.length > 0)
            failures.push(`${key} unintended overflow ${JSON.stringify(report.overflow)}`);
          if (report.overlap.length > 0)
            failures.push(`${key} field/action overlap ${JSON.stringify(report.overlap)}`);
          if (report.textGlyphNavigation.length > 0)
            failures.push(
              `${key} text glyph navigation ${JSON.stringify(report.textGlyphNavigation)}`
            );
          const hiddenRoutes = report.routeVisibility
            .filter(({ visible }) => !visible)
            .map(({ route }) => route);
          if (hiddenRoutes.length > 0)
            failures.push(`${key} product navigation hides routes ${JSON.stringify(hiddenRoutes)}`);
          if (report.forbiddenTextMatches.length > 0)
            failures.push(
              `${key} forbidden visible text ${JSON.stringify(report.forbiddenTextMatches)}`
            );
          if (requiredPanelCount !== undefined && report.panelCount !== requiredPanelCount)
            failures.push(
              `${key} visible panel count ${report.panelCount} != ${requiredPanelCount}`
            );
          if (
            requiredRailBackground !== undefined &&
            report.railBackground !== requiredRailBackground
          )
            failures.push(
              `${key} rail background ${report.railBackground} != ${requiredRailBackground}`
            );
          const missingVisibleText = requiredVisibleText.filter(
            (value) => !report.visiblePageText.includes(value.toLocaleLowerCase("en-US"))
          );
          if (missingVisibleText.length > 0)
            failures.push(`${key} missing visible text ${JSON.stringify(missingVisibleText)}`);
          const requiredPanelRoles = requiredPanelLayoutByScreen[screen];
          if (requiredPanelRoles !== undefined) {
            const panelsByRole = new Map(report.panelRoles.map((panel) => [panel.role, panel]));
            const missingRoles = requiredPanelRoles.filter((role) => !panelsByRole.has(role));
            if (missingRoles.length > 0 || report.panelRoles.length !== requiredPanelRoles.length) {
              failures.push(
                `${key} panel roles ${JSON.stringify(report.panelRoles.map(({ role }) => role))} != ${JSON.stringify(requiredPanelRoles)}`
              );
            } else {
              const [first, second, third] = requiredPanelRoles.map((role) =>
                panelsByRole.get(role)
              );
              const desktopLayout =
                Math.abs(first.left - second.left) < 4 &&
                second.top > first.top &&
                third.left > first.left + 40 &&
                Math.abs(third.top - first.top) < 4;
              const mobileLayout =
                Math.abs(first.left - second.left) < 4 &&
                Math.abs(first.left - third.left) < 4 &&
                first.top < second.top &&
                second.top < third.top;
              if (viewport.name === "desktop" ? !desktopLayout : !mobileLayout)
                failures.push(`${key} panel role geometry does not match focused layout`);
            }
          }
          const crampedActions = report.actionGaps.filter(
            ({ gap, divided }) => gap < 16 && !(gap >= -1 && divided)
          );
          if (crampedActions.length > 0)
            failures.push(
              `${key} action gap below 16px without divider ${JSON.stringify(crampedActions)}`
            );
          const pageHeightLimit = maxPageHeight[viewport.name];
          if (pageHeightLimit !== undefined && report.pageHeight > pageHeightLimit)
            failures.push(`${key} page height ${report.pageHeight}px > ${pageHeightLimit}px`);
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
  return { ok: failures.length === 0, reports, failures };
}
