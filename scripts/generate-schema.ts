import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { format } from "prettier";
import { WorkflowDefinitionSchema } from "../packages/ir/src/index.js";

const target = resolve("packages/ir/schema/wir-v1.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(
  target,
  await format(JSON.stringify(WorkflowDefinitionSchema), {
    parser: "json",
    printWidth: 100,
    singleQuote: false,
    trailingComma: "none"
  }),
  "utf8"
);
