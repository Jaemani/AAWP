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
});
