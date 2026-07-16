import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareSpecFeedbackRequest } from "./spec-feedback-request.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("spec-feedback Studio request", () => {
  it("pins nested stable feedback IDs from level-2 through level-6 headings", async () => {
    const root = await mkdtemp(join(tmpdir(), "aawp-spec-feedback-"));
    roots.push(root);
    await mkdir(join(root, "inputs"));
    await mkdir(join(root, "runs", "requests"), { recursive: true });
    await writeFile(join(root, "inputs", "source.json"), JSON.stringify({ meta: {}, screens: [] }));
    await writeFile(
      join(root, "inputs", "feedback.md"),
      [
        "# Evidence feedback",
        "",
        "## FB-EVD-S1-001 — S1 판정을 철회한다",
        "",
        "`status: confirmed`",
        "",
        "#### FB-EVD-AUTH-002 — 명부 결재 action을 교정한다",
        "",
        "`status: confirmed`"
      ].join("\n")
    );

    const prepared = await prepareSpecFeedbackRequest({
      projectRoot: root,
      launcher: {
        sourcePath: "inputs/source.json",
        feedbackPath: "inputs/feedback.md",
        requestText: "증거 피드백을 적용한다",
        targetMaturity: "S1"
      }
    });

    expect(prepared.inputs.feedback.feedbackIds).toEqual(["FB-EVD-S1-001", "FB-EVD-AUTH-002"]);
    const pinned = JSON.parse(await readFile(join(root, prepared.requestPath), "utf8"));
    expect(pinned.feedback.feedbackIds).toEqual(prepared.inputs.feedback.feedbackIds);
  });
});
