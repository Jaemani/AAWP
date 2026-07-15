import { createHash } from "node:crypto";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile
} from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";

export interface StudioDemoRecord {
  label: string;
  entryUrl: string;
  contentDigest: string;
}

export interface StudioDemoAsset {
  content: Buffer;
  mediaType: string;
}

export interface StudioDemoStore {
  createSnapshot(runId: string): Promise<StudioDemoRecord | undefined>;
  exists(runId: string): Promise<boolean>;
  isOnboarded(runId: string): Promise<boolean>;
  onboard(runId: string): Promise<boolean>;
  offboard(runId: string): Promise<boolean>;
  delete(runId: string): Promise<boolean>;
  read(runId: string, assetPath: string): Promise<StudioDemoAsset | undefined>;
}

const ONBOARD_MARKER = ".aawp-onboarded";

function assertRunId(runId: string): void {
  if (!/^run_[A-Za-z0-9-]+$/.test(runId)) throw new Error(`invalid demo run id: ${runId}`);
}

function mediaType(path: string): string {
  const extension = path.slice(path.lastIndexOf(".")).toLowerCase();
  return (
    (
      {
        ".css": "text/css; charset=utf-8",
        ".gif": "image/gif",
        ".html": "text/html; charset=utf-8",
        ".ico": "image/x-icon",
        ".jpeg": "image/jpeg",
        ".jpg": "image/jpeg",
        ".js": "text/javascript; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".mjs": "text/javascript; charset=utf-8",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".webp": "image/webp"
      } as Record<string, string>
    )[extension] ?? "application/octet-stream"
  );
}

async function directoryDigest(directory: string): Promise<string> {
  const hash = createHash("sha256");

  async function visit(path: string): Promise<void> {
    const entries = await readdir(path, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const absolutePath = join(path, entry.name);
      if (entry.isSymbolicLink())
        throw new Error(`demo source contains a symlink: ${absolutePath}`);
      if (entry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!entry.isFile())
        throw new Error(`demo source contains an unsupported entry: ${absolutePath}`);
      hash.update(relative(directory, absolutePath));
      hash.update("\0");
      hash.update(await readFile(absolutePath));
      hash.update("\0");
    }
  }

  await visit(directory);
  return hash.digest("hex");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export class LocalStudioDemoStore implements StudioDemoStore {
  private readonly rootDirectory: string;
  private readonly sourceDirectory: string | undefined;
  private onboardingTail: Promise<void> = Promise.resolve();

  constructor(input: { rootDirectory: string; sourceDirectory?: string }) {
    this.rootDirectory = resolve(input.rootDirectory);
    this.sourceDirectory =
      input.sourceDirectory === undefined ? undefined : resolve(input.sourceDirectory);
  }

  private runDirectory(runId: string): string {
    assertRunId(runId);
    return join(this.rootDirectory, runId, "demo");
  }

  private sourceDirectoryFor(runId: string): string | undefined {
    if (this.sourceDirectory === undefined) return undefined;
    assertRunId(runId);
    return resolve(this.sourceDirectory.replaceAll("{runId}", runId));
  }

  async createSnapshot(runId: string): Promise<StudioDemoRecord | undefined> {
    const sourceDirectory = this.sourceDirectoryFor(runId);
    if (sourceDirectory === undefined) return undefined;
    const entryPath = join(sourceDirectory, "index.html");
    const entry = await stat(entryPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") throw new Error(`demo source has no index.html: ${entryPath}`);
      throw error;
    });
    if (!entry.isFile()) throw new Error(`demo source index is not a file: ${entryPath}`);

    const runRoot = join(this.rootDirectory, runId);
    await mkdir(runRoot, { recursive: true });
    const temporaryDirectory = await mkdtemp(join(runRoot, ".demo-snapshot-"));
    const targetDirectory = this.runDirectory(runId);
    try {
      await cp(sourceDirectory, temporaryDirectory, { recursive: true, errorOnExist: true });
      const contentDigest = await directoryDigest(temporaryDirectory);
      await rename(temporaryDirectory, targetDirectory);
      return {
        label: basename(sourceDirectory),
        entryUrl: `/runs/${encodeURIComponent(runId)}/demo/`,
        contentDigest
      };
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async exists(runId: string): Promise<boolean> {
    return pathExists(join(this.runDirectory(runId), "index.html"));
  }

  async isOnboarded(runId: string): Promise<boolean> {
    return pathExists(join(this.runDirectory(runId), ONBOARD_MARKER));
  }

  async onboard(runId: string): Promise<boolean> {
    if (!(await this.exists(runId))) return false;
    const previous = this.onboardingTail;
    let release!: () => void;
    this.onboardingTail = new Promise<void>((resolvePromise) => {
      release = resolvePromise;
    });
    await previous;
    try {
      let changed = false;
      const targetDirectory = this.runDirectory(runId);
      const entries = await readdir(this.rootDirectory, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const entryDirectory = join(this.rootDirectory, entry.name, "demo");
        if (entryDirectory === targetDirectory) continue;
        const markerPath = join(entryDirectory, ONBOARD_MARKER);
        if (await pathExists(markerPath)) {
          await rm(markerPath, { force: true });
          changed = true;
        }
      }
      const markerPath = join(targetDirectory, ONBOARD_MARKER);
      if (!(await pathExists(markerPath))) {
        await writeFile(markerPath, "onboarded\n", { encoding: "utf8", mode: 0o600 });
        changed = true;
      }
      return changed;
    } finally {
      release();
    }
  }

  async offboard(runId: string): Promise<boolean> {
    const markerPath = join(this.runDirectory(runId), ONBOARD_MARKER);
    if (!(await pathExists(markerPath))) return false;
    await rm(markerPath, { force: true });
    return true;
  }

  async delete(runId: string): Promise<boolean> {
    const directory = this.runDirectory(runId);
    if (!(await pathExists(directory))) return false;
    await rm(directory, { recursive: true, force: true });
    return true;
  }

  async read(runId: string, assetPath: string): Promise<StudioDemoAsset | undefined> {
    if (!(await this.isOnboarded(runId))) return undefined;
    const runDirectory = this.runDirectory(runId);
    const requestedPath = assetPath.length === 0 ? "index.html" : decodeURIComponent(assetPath);
    if (requestedPath === ONBOARD_MARKER) return undefined;
    const absolutePath = resolve(runDirectory, requestedPath);
    if (absolutePath !== runDirectory && !absolutePath.startsWith(`${runDirectory}${sep}`))
      return undefined;

    try {
      const [realRunDirectory, realAssetPath] = await Promise.all([
        realpath(runDirectory),
        realpath(absolutePath)
      ]);
      if (
        realAssetPath !== realRunDirectory &&
        !realAssetPath.startsWith(`${realRunDirectory}${sep}`)
      )
        return undefined;
      const asset = await stat(realAssetPath);
      if (!asset.isFile()) return undefined;
      return { content: await readFile(realAssetPath), mediaType: mediaType(realAssetPath) };
    } catch (error) {
      if (["ENOENT", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))
        return undefined;
      throw error;
    }
  }
}
