import { expect, it } from "vitest";
// @ts-expect-error -- the design contract helper is an ESM JavaScript script.
import { parseDesignContractName, parseDesignContractVersion } from "./design-contract-lib.mjs";

it("reads the canonical version from YAML front matter", () => {
  expect(parseDesignContractVersion("---\nname: Example\nversion: 1.7.0\n---\n# Design\n")).toBe(
    "1.7.0"
  );
});

it("reads the product identity from YAML front matter", () => {
  expect(
    parseDesignContractName("---\nname: Gyeonggi Integrated Wallet\nversion: 1.7.0\n---\n")
  ).toBe("Gyeonggi Integrated Wallet");
});

it("keeps legacy metadata readable during migration", () => {
  expect(parseDesignContractVersion("# Design\n\n- 버전: 1.6.0\n")).toBe("1.6.0");
});
