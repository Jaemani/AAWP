import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { FileHandle } from "node:fs/promises";

export interface CasObject {
  contentHash: string;
  sizeBytes: number;
  storageUri: string;
}

export class InvalidContentHashError extends Error {
  constructor(readonly contentHash: string) {
    super(`invalid SHA-256 content hash: ${contentHash}`);
    this.name = "InvalidContentHashError";
  }
}

export class ContentHashMismatchError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string
  ) {
    super(`content hash mismatch: expected ${expected}, received ${actual}`);
    this.name = "ContentHashMismatchError";
  }
}

export class CorruptCasObjectError extends Error {
  constructor(
    readonly expected: string,
    readonly actual: string
  ) {
    super(`corrupt CAS object: expected ${expected}, received ${actual}`);
    this.name = "CorruptCasObjectError";
  }
}

export type CasUploadSource = Uint8Array | AsyncIterable<Uint8Array>;

function assertContentHash(contentHash: string): void {
  if (!/^[0-9a-f]{64}$/.test(contentHash)) throw new InvalidContentHashError(contentHash);
}

async function* chunks(source: CasUploadSource): AsyncIterable<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array))
      throw new TypeError("CAS upload chunks must be Uint8Array values");
    yield chunk;
  }
}

async function writeAll(handle: FileHandle, chunk: Uint8Array): Promise<void> {
  let offset = 0;
  while (offset < chunk.byteLength) {
    const { bytesWritten } = await handle.write(chunk, offset, chunk.byteLength - offset);
    if (bytesWritten === 0) throw new Error("CAS upload made no write progress");
    offset += bytesWritten;
  }
}

export class LocalObjectCas {
  constructor(private readonly rootDir: string) {}

  objectPath(contentHash: string): string {
    assertContentHash(contentHash);
    return resolve(this.rootDir, "sha256", contentHash.slice(0, 2), contentHash);
  }

  async put(source: CasUploadSource, expectedHash?: string): Promise<CasObject> {
    if (expectedHash !== undefined) assertContentHash(expectedHash);
    const temporaryPath = resolve(this.rootDir, "tmp", `${randomUUID()}.upload`);
    await mkdir(dirname(temporaryPath), { recursive: true });
    const handle = await open(temporaryPath, "wx");
    const hash = createHash("sha256");
    let sizeBytes = 0;
    let handleClosed = false;
    let committed = false;
    try {
      for await (const chunk of chunks(source)) {
        await writeAll(handle, chunk);
        hash.update(chunk);
        sizeBytes += chunk.byteLength;
      }
      await handle.sync();
      await handle.close();
      handleClosed = true;

      const contentHash = hash.digest("hex");
      if (expectedHash !== undefined && contentHash !== expectedHash) {
        throw new ContentHashMismatchError(expectedHash, contentHash);
      }
      const destination = this.objectPath(contentHash);
      await mkdir(dirname(destination), { recursive: true });
      try {
        const existing = await readFile(destination);
        const existingHash = createHash("sha256").update(existing).digest("hex");
        if (existingHash !== contentHash)
          throw new CorruptCasObjectError(contentHash, existingHash);
        await rm(temporaryPath, { force: true });
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
        await rename(temporaryPath, destination);
      }
      committed = true;
      return {
        contentHash,
        sizeBytes,
        storageUri: pathToFileURL(destination).href
      };
    } finally {
      if (!handleClosed) await handle.close().catch(() => undefined);
      if (!committed) await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  async get(contentHash: string): Promise<Uint8Array> {
    const bytes = await readFile(this.objectPath(contentHash));
    const actual = createHash("sha256").update(bytes).digest("hex");
    if (actual !== contentHash) throw new CorruptCasObjectError(contentHash, actual);
    return bytes;
  }

  async has(contentHash: string): Promise<boolean> {
    try {
      await stat(this.objectPath(contentHash));
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return false;
      throw error;
    }
  }
}
