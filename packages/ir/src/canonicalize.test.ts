import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { CanonicalizationError, canonicalize, digestWorkflow } from "./index.js";

describe("canonicalize", () => {
  it("orders object keys deterministically", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
    expect(digestWorkflow({ b: 1, a: 2 })).toBe(digestWorkflow({ a: 2, b: 1 }));
  });

  it("NFC-normalizes strings and keys", () => {
    expect(canonicalize({ cafe: "cafe\u0301" })).toBe('{"cafe":"café"}');
    expect(canonicalize({ "cafe\u0301": "x" })).toBe('{"café":"x"}');
  });

  it("rejects post-normalization key collisions", () => {
    expect(() => canonicalize({ é: 1, "e\u0301": 2 })).toThrow(CanonicalizationError);
  });

  it("rejects unsupported and non-finite values", () => {
    expect(() => canonicalize({ x: undefined })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ x: Number.NaN })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ x: Number.POSITIVE_INFINITY })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ x: 1n })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ x: Symbol("x") })).toThrow(CanonicalizationError);
    expect(() => canonicalize({ x: () => true })).toThrow(CanonicalizationError);
  });

  it("rejects cyclic objects", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });

  it("rejects Date and custom prototype objects", () => {
    class CustomObject {
      value = 1;
    }
    expect(() => canonicalize({ x: new Date("2026-01-01T00:00:00.000Z") })).toThrow(
      CanonicalizationError
    );
    expect(() => canonicalize({ x: new CustomObject() })).toThrow(CanonicalizationError);
  });

  it("rejects sparse arrays", () => {
    const sparse = [1, , 3];
    expect(() => canonicalize(sparse)).toThrow(CanonicalizationError);
  });

  it("rejects accessor properties", () => {
    const value = {
      get x(): number {
        return 1;
      }
    };
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });

  it("rejects symbol keys", () => {
    expect(() => canonicalize({ [Symbol("x")]: 1 })).toThrow(CanonicalizationError);
  });

  it("rejects non-enumerable own properties", () => {
    const value = { visible: true };
    Object.defineProperty(value, "hidden", { value: true, enumerable: false });
    expect(() => canonicalize(value)).toThrow(CanonicalizationError);
  });

  it("has stable numeric encoding", () => {
    expect(canonicalize({ n: -0 })).toBe('{"n":0}');
    expect(canonicalize({ n: 1.25 })).toBe('{"n":1.25}');
  });

  it("matches the golden digest", () => {
    expect(digestWorkflow({ z: ["é", 3], a: true })).toBe(
      "fddec052bf689b781396613995a29ec972fa8bc9b5c35725c1ec2274dfa55e98"
    );
  });

  it("is independent from insertion order for simple dictionaries", () => {
    fc.assert(
      fc.property(
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.integer()),
        (record) => {
          const entries = Object.entries(record);
          const reversed = Object.fromEntries([...entries].reverse());
          expect(digestWorkflow(record)).toBe(digestWorkflow(reversed));
        }
      ),
      { numRuns: 100 }
    );
  });
});
