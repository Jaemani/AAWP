import YAML from "yaml";

function parseFrontMatter(source) {
  const frontMatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1];
  return frontMatter === undefined ? undefined : YAML.parse(frontMatter);
}

export function parseDesignContractVersion(source) {
  if (typeof source !== "string") throw new TypeError("DESIGN.md source must be a string");
  const parsed = parseFrontMatter(source);
  if (typeof parsed?.version === "string" && parsed.version.trim().length > 0) {
    return parsed.version.trim();
  }
  const legacy = source.match(/^- 버전:\s*([^\s]+)$/mu)?.[1];
  if (legacy !== undefined) return legacy;
  throw new Error("DESIGN.md has no version field");
}

export function parseDesignContractName(source) {
  if (typeof source !== "string") throw new TypeError("DESIGN.md source must be a string");
  const parsed = parseFrontMatter(source);
  if (typeof parsed?.name === "string" && parsed.name.trim().length > 0) {
    return parsed.name.trim();
  }
  throw new Error("DESIGN.md has no name field");
}
