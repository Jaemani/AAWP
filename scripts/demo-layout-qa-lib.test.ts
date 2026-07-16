import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
// @ts-expect-error -- the production QA helper is an ESM JavaScript script.
import { runDemoLayoutQa, startStaticDemoServer } from "./demo-layout-qa-lib.mjs";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

it("serves and renders every hash screen from a fresh browser document", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aawp-demo-qa-"));
  temporaryDirectories.push(directory);
  await Promise.all([
    writeFile(
      join(directory, "index.html"),
      '<!doctype html><main id="app"></main><script src="app.js"></script>'
    ),
    writeFile(
      join(directory, "app.js"),
      `const screen = location.hash.slice(1);
       document.querySelector("#app").innerHTML =
         '<section class="panel">' + screen + (screen === "a" ? '<input value="a">' : "") + '</section>';`
    )
  ]);

  const server = await startStaticDemoServer(directory);
  try {
    const result = await runDemoLayoutQa({
      url: server.url,
      screens: ["a", "b"],
      takeScreenshots: false,
      requiredPanelCount: 1
    });

    expect(result.ok).toBe(true);
    expect(result.reports.map((report: { controls: unknown[] }) => report.controls.length)).toEqual(
      [1, 0, 1, 0]
    );
  } finally {
    await server.close();
  }
});

it("rejects an HTTP error page instead of treating its empty layout as a passing demo", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aawp-demo-qa-"));
  temporaryDirectories.push(directory);
  await writeFile(join(directory, "index.html"), "<!doctype html><main>demo</main>");

  const server = await startStaticDemoServer(directory);
  try {
    const result = await runDemoLayoutQa({
      url: new URL("missing", server.url).href,
      screens: ["missing"],
      takeScreenshots: false
    });

    expect(result.ok).toBe(false);
    expect(result.failures).toContain("desktop:missing navigation status 404");
    expect(result.failures).toContain("mobile:missing navigation status 404");
  } finally {
    await server.close();
  }
});

it("rejects financial metric values that wrap onto multiple lines", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aawp-demo-qa-"));
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, "index.html"),
    `<!doctype html><style>
      .metrics { width: 80px; }
      .metrics strong { display: block; font-size: 20px; line-height: 24px; overflow-wrap: anywhere; }
      .visually-hidden { clip: rect(0 0 0 0); clip-path: inset(50%); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
    </style><nav class="visually-hidden"><a href="#metric">아주 긴 접근성용 화면 바로가기</a></nav><div class="metrics"><strong>221,460,000원</strong></div>`
  );

  const server = await startStaticDemoServer(directory);
  try {
    const result = await runDemoLayoutQa({
      url: server.url,
      screens: ["metric"],
      takeScreenshots: false
    });

    expect(result.ok).toBe(false);
    expect(
      result.failures.some((failure: string) => failure.includes("wrapped financial metrics"))
    ).toBe(true);
    expect(result.failures.some((failure: string) => failure.includes("unintended overflow"))).toBe(
      false
    );
  } finally {
    await server.close();
  }
});

it("rejects requested product routes hidden behind unindicated horizontal scrolling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "aawp-demo-qa-"));
  temporaryDirectories.push(directory);
  await writeFile(
    join(directory, "index.html"),
    `<!doctype html><style>
      nav { display: flex; overflow-x: auto; width: 390px; }
      nav a { box-sizing: border-box; flex: 0 0 auto; width: 390px; }
    </style><nav><a href="#a">화면 A</a><a href="#b">화면 B</a></nav>`
  );

  const server = await startStaticDemoServer(directory);
  try {
    const result = await runDemoLayoutQa({
      url: server.url,
      screens: ["a"],
      takeScreenshots: false,
      requiredVisibleRoutes: ["a", "b"]
    });

    expect(result.ok).toBe(false);
    expect(
      result.failures.some((failure: string) =>
        failure.includes('product navigation hides routes ["b"]')
      )
    ).toBe(true);
  } finally {
    await server.close();
  }
});
