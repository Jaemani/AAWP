import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { main } from "./index.js";

async function capture(
  fn: () => Promise<number>
): Promise<{ code: number; stdout: string; stderr: string }> {
  const out: string[] = [];
  const err: string[] = [];
  const oldOut = process.stdout.write;
  const oldErr = process.stderr.write;
  process.stdout.write = ((chunk: string | Uint8Array) => {
    out.push(String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    err.push(String(chunk));
    return true;
  }) as typeof process.stderr.write;
  try {
    return { code: await fn(), stdout: out.join(""), stderr: err.join("") };
  } finally {
    process.stdout.write = oldOut;
    process.stderr.write = oldErr;
  }
}

describe("awf CLI", () => {
  it("checks YAML workflows", async () => {
    const result = await capture(() => main(["check", "examples/spec-to-demo.wir.yaml"]));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
  });

  it("checks JSON workflows", async () => {
    const dir = await mkdtemp(join(tmpdir(), "awf-cli-"));
    const file = join(dir, "workflow.json");
    const workflow = parseYaml(await readFile("examples/spec-to-demo.wir.yaml", "utf8"));
    await writeFile(file, JSON.stringify(workflow), "utf8");
    const result = await capture(() => main(["check", file]));
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout).ok).toBe(true);
  });

  it("returns exit 1 for WIR validation errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "awf-cli-"));
    const file = join(dir, "bad.json");
    await writeFile(file, JSON.stringify({ apiVersion: "awf/v1" }), "utf8");
    const result = await capture(() => main(["check", file]));
    expect(result.code).toBe(1);
  });

  it("returns exit 2 for parse errors", async () => {
    const dir = await mkdtemp(join(tmpdir(), "awf-cli-"));
    const file = join(dir, "bad.json");
    await writeFile(file, "{", "utf8");
    const result = await capture(() => main(["check", file]));
    expect(result.code).toBe(2);
  });

  it("simulates deterministically", async () => {
    const first = await capture(() =>
      main([
        "simulate",
        "examples/spec-to-demo.wir.yaml",
        "--input",
        "examples/spec-to-demo.input.json"
      ])
    );
    const second = await capture(() =>
      main([
        "simulate",
        "examples/spec-to-demo.wir.yaml",
        "--input",
        "examples/spec-to-demo.input.json"
      ])
    );
    expect(first.code).toBe(0);
    expect(second.code).toBe(0);
    expect(first.stdout).toBe(second.stdout);
    expect(JSON.parse(first.stdout).workflowId).toBe("spec-to-demo");
  });

  it("returns exit 2 and INVALID_FIXTURE for missing, extra, and schema-invalid fixture inputs", async () => {
    const dir = await mkdtemp(join(tmpdir(), "awf-cli-"));
    const missing = join(dir, "missing.json");
    const extra = join(dir, "extra.json");
    const mismatch = join(dir, "mismatch.json");
    await writeFile(missing, JSON.stringify({}), "utf8");
    await writeFile(extra, JSON.stringify({ brief: { title: "ok" }, extra: true }), "utf8");
    await writeFile(mismatch, JSON.stringify({ brief: {} }), "utf8");

    for (const fixture of [missing, extra, mismatch]) {
      const result = await capture(() =>
        main(["simulate", "examples/spec-to-demo.wir.yaml", "--input", fixture])
      );
      const body = JSON.parse(result.stdout);
      expect(result.code).toBe(2);
      expect(body.error).toBe("INVALID_FIXTURE");
    }
  });

  it("can read checked-in example bytes", async () => {
    await expect(readFile("examples/spec-to-demo.wir.yaml", "utf8")).resolves.toContain(
      "spec-to-demo"
    );
  });
});
