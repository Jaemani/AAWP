import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareSpecToDemoRequest } from "./spec-to-demo-request.js";

let roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
  roots = [];
});

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aawp-request-"));
  roots.push(root);
  await mkdir(join(root, "specs"));
  await mkdir(join(root, "runs", "requests"), { recursive: true });
  await writeFile(join(root, "DESIGN.md"), "---\nname: Fixture\nversion: 1.2.3\n---\n");
  await writeFile(
    join(root, "specs", "source.json"),
    JSON.stringify({
      meta: { scenario: "fixture" },
      actors: [{ id: "admin" }, { id: "merchant" }],
      components: [{ name: "PolicyPanel" }, { name: "Unused" }],
      screens: [
        { id: "policy-list", actors: ["admin"], components: ["PolicyPanel"] },
        { id: "merchant-home", actors: ["merchant"], components: ["Unused"] }
      ]
    })
  );
  return root;
}

describe("spec-to-demo Studio request", () => {
  it("pins a project-relative source projection and DESIGN.md digest", async () => {
    const root = await fixtureRoot();
    const prepared = await prepareSpecToDemoRequest({
      projectRoot: root,
      launcher: {
        sourcePath: "specs/source.json",
        screenIds: ["policy-list", "policy-list"],
        requestText: "정책 화면을 만들어줘"
      }
    });

    expect(prepared.inputs.brief).toMatchObject({
      requestText: "정책 화면을 만들어줘",
      requestedScreens: ["policy-list"],
      sourceSpec: {
        originalFilename: "source.json",
        projection: "requested-screen-closure-v1"
      },
      designContract: { path: "DESIGN.md", version: "1.2.3" }
    });
    expect(prepared.requestPath).toMatch(/^runs\/requests\/spec-to-demo-/);
    const pinned = JSON.parse(
      await readFile(join(root, prepared.inputs.brief.sourceSpec.path), "utf8")
    ) as { screens: Array<{ id: string }>; actors: Array<{ id: string }> };
    expect(pinned.screens.map((screen) => screen.id)).toEqual(["policy-list"]);
    expect(pinned.actors.map((actor) => actor.id)).toEqual(["admin"]);
  });

  it("rejects absolute, escaping, symlinked and unknown screen inputs", async () => {
    const root = await fixtureRoot();
    const outside = await mkdtemp(join(tmpdir(), "aawp-outside-"));
    roots.push(outside);
    await writeFile(join(outside, "source.json"), JSON.stringify({ screens: [] }));
    await symlink(join(outside, "source.json"), join(root, "specs", "outside.json"));
    const base = { screenIds: ["policy-list"], requestText: "test" };

    await expect(
      prepareSpecToDemoRequest({
        projectRoot: root,
        launcher: { ...base, sourcePath: join(root, "specs", "source.json") }
      })
    ).rejects.toThrow(/project-relative/);
    await expect(
      prepareSpecToDemoRequest({
        projectRoot: root,
        launcher: { ...base, sourcePath: "../source.json" }
      })
    ).rejects.toThrow(/workspace/);
    await expect(
      prepareSpecToDemoRequest({
        projectRoot: root,
        launcher: { ...base, sourcePath: "specs/outside.json" }
      })
    ).rejects.toThrow(/symlink/);
    await expect(
      prepareSpecToDemoRequest({
        projectRoot: root,
        launcher: { ...base, sourcePath: "specs/source.json", screenIds: ["missing"] }
      })
    ).rejects.toThrow(/screen이 없습니다/);
  });
});
