import { createHash } from "node:crypto";
import { mkdtemp, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ContentHashMismatchError, CorruptCasObjectError, LocalObjectCas } from "./cas.js";

async function root(): Promise<string> {
  return mkdtemp(join(tmpdir(), "awf-cas-"));
}

describe("LocalObjectCas", () => {
  it("deduplicates identical content", async () => {
    const cas = new LocalObjectCas(await root());
    const first = await cas.put(Buffer.from("same bytes"));
    const second = await cas.put(Buffer.from("same bytes"));
    expect(second).toEqual(first);
    expect(Buffer.from(await cas.get(first.contentHash)).toString("utf8")).toBe("same bytes");
  });

  it("rejects an expected hash mismatch without publishing", async () => {
    const cas = new LocalObjectCas(await root());
    const expected = createHash("sha256").update("other bytes").digest("hex");
    await expect(cas.put(Buffer.from("actual bytes"), expected)).rejects.toBeInstanceOf(
      ContentHashMismatchError
    );
    await expect(cas.has(expected)).resolves.toBe(false);
  });

  it("removes a temporary object when an upload is interrupted", async () => {
    const directory = await root();
    const cas = new LocalObjectCas(directory);
    async function* interrupted(): AsyncIterable<Uint8Array> {
      yield Buffer.from("partial");
      throw new Error("source interrupted");
    }
    await expect(cas.put(interrupted())).rejects.toThrow("source interrupted");
    await expect(readdir(join(directory, "tmp"))).resolves.toEqual([]);
  });

  it("detects content corruption on read", async () => {
    const cas = new LocalObjectCas(await root());
    const stored = await cas.put(Buffer.from("trusted"));
    await writeFile(cas.objectPath(stored.contentHash), "tampered");
    await expect(cas.get(stored.contentHash)).rejects.toBeInstanceOf(CorruptCasObjectError);
  });
});
