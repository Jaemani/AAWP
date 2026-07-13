#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";
import { validateWorkflow } from "@awf/compiler";
import type { WorkflowDefinition } from "@awf/ir";
import {
  FixtureValidationError,
  SimulationError,
  simulateDeterministic,
  stableTraceJson,
  validateFixtureInput
} from "@awf/runtime-core";

async function readStructured(path: string): Promise<unknown> {
  const text = await readFile(path, "utf8");
  if (extname(path) === ".yaml" || extname(path) === ".yml") {
    return parseYaml(text) as unknown;
  }
  return JSON.parse(text) as unknown;
}

function print(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function printUsage(): void {
  process.stderr.write("usage: awf check FILE | awf simulate FILE --input FIXTURE\n");
}

export async function main(argv: string[]): Promise<number> {
  const [command, file, ...rest] = argv;
  if ((command !== "check" && command !== "simulate") || file === undefined) {
    printUsage();
    return 2;
  }

  let workflow: unknown;
  try {
    workflow = await readStructured(file);
  } catch (error) {
    print({
      ok: false,
      error: "IO_OR_PARSE_ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
    return 2;
  }

  const result = validateWorkflow(workflow);
  if (command === "check") {
    print(result);
    return result.ok ? 0 : 1;
  }
  if (!result.ok) {
    print(result);
    return 1;
  }

  const inputIndex = rest.indexOf("--input");
  const fixturePath = inputIndex >= 0 ? rest[inputIndex + 1] : undefined;
  if (fixturePath === undefined) {
    printUsage();
    return 2;
  }

  let fixture: unknown;
  try {
    fixture = await readStructured(fixturePath);
    const fixtureInput = validateFixtureInput(workflow as WorkflowDefinition, fixture);
    process.stdout.write(
      stableTraceJson(simulateDeterministic(workflow as WorkflowDefinition, fixtureInput))
    );
    return 0;
  } catch (error) {
    if (error instanceof FixtureValidationError) {
      print({ ok: false, error: error.code, diagnostics: error.diagnostics });
      return 2;
    }
    if (error instanceof SimulationError) {
      print({ ok: false, error: error.code, message: error.message, details: error.details });
      return 1;
    }
    print({
      ok: false,
      error: "IO_OR_PARSE_ERROR",
      message: error instanceof Error ? error.message : String(error)
    });
    return 2;
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main(process.argv.slice(2));
}
