import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalStudioDemoStore } from "./demo-store.js";

let directory: string | undefined;

afterEach(async () => {
  if (directory !== undefined) await rm(directory, { recursive: true, force: true });
  directory = undefined;
});

describe("local Studio demo store", () => {
  it("materializes a run-scoped builder artifact under the same run root", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-demo-run-root-"));
    const runRoot = join(directory, "runs");
    const sourceDirectory = join(runRoot, "run_scoped", "artifacts", "demo");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "index.html"), "<h1>scoped demo</h1>");
    const store = new LocalStudioDemoStore({
      rootDirectory: runRoot,
      sourceDirectory: join(runRoot, "{runId}", "artifacts", "demo")
    });

    await expect(store.createSnapshot("run_scoped")).resolves.toMatchObject({
      entryUrl: "/runs/run_scoped/demo/"
    });
    await expect(store.onboard("run_scoped")).resolves.toBe(true);
    await expect(store.read("run_scoped", "index.html")).resolves.toMatchObject({
      content: Buffer.from("<h1>scoped demo</h1>")
    });
  });

  it("creates an offboarded snapshot, controls serving, and deletes only the snapshot", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-demo-"));
    const sourceDirectory = join(directory, "source");
    await mkdir(join(sourceDirectory, "assets"), { recursive: true });
    await writeFile(join(sourceDirectory, "index.html"), "<h1>demo</h1>");
    await writeFile(join(sourceDirectory, "assets", "app.css"), "body{color:#191f28}");
    const store = new LocalStudioDemoStore({
      rootDirectory: join(directory, "results"),
      sourceDirectory
    });

    const record = await store.createSnapshot("run_demo-1");
    expect(record).toMatchObject({
      label: "source",
      entryUrl: "/runs/run_demo-1/demo/"
    });
    expect(record?.contentDigest).toMatch(/^[a-f0-9]{64}$/);
    await expect(store.exists("run_demo-1")).resolves.toBe(true);
    await expect(store.isOnboarded("run_demo-1")).resolves.toBe(false);
    await expect(store.read("run_demo-1", "")).resolves.toBeUndefined();
    await expect(store.onboard("run_demo-1")).resolves.toBe(true);
    await expect(store.onboard("run_demo-1")).resolves.toBe(false);
    await expect(store.isOnboarded("run_demo-1")).resolves.toBe(true);
    await expect(store.read("run_demo-1", "")).resolves.toMatchObject({
      mediaType: "text/html; charset=utf-8",
      content: Buffer.from("<h1>demo</h1>")
    });
    await expect(store.read("run_demo-1", "assets/app.css")).resolves.toMatchObject({
      mediaType: "text/css; charset=utf-8"
    });
    await expect(store.read("run_demo-1", "../outside.txt")).resolves.toBeUndefined();
    await expect(store.read("run_demo-1", ".aawp-onboarded")).resolves.toBeUndefined();

    await expect(store.offboard("run_demo-1")).resolves.toBe(true);
    await expect(store.offboard("run_demo-1")).resolves.toBe(false);
    await expect(store.exists("run_demo-1")).resolves.toBe(true);
    await expect(store.read("run_demo-1", "")).resolves.toBeUndefined();

    await expect(store.delete("run_demo-1")).resolves.toBe(true);
    await expect(store.exists("run_demo-1")).resolves.toBe(false);
    await expect(store.delete("run_demo-1")).resolves.toBe(false);
    await expect(store.onboard("run_demo-1")).resolves.toBe(false);
  });

  it("keeps at most one demo onboarded", async () => {
    directory = await mkdtemp(join(tmpdir(), "awf-demo-"));
    const sourceDirectory = join(directory, "source");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(join(sourceDirectory, "index.html"), "<h1>demo</h1>");
    const store = new LocalStudioDemoStore({
      rootDirectory: join(directory, "results"),
      sourceDirectory
    });
    await store.createSnapshot("run_first");
    await store.createSnapshot("run_second");

    await expect(store.onboard("run_first")).resolves.toBe(true);
    await expect(store.onboard("run_second")).resolves.toBe(true);
    await expect(store.isOnboarded("run_first")).resolves.toBe(false);
    await expect(store.isOnboarded("run_second")).resolves.toBe(true);
    await expect(store.read("run_first", "index.html")).resolves.toBeUndefined();
    await expect(store.read("run_second", "index.html")).resolves.toMatchObject({
      mediaType: "text/html; charset=utf-8"
    });
  });
});
