import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { WorkflowDefinitionSchema } from "../packages/ir/src/index.js";

const target = resolve("packages/ir/schema/wir-v1.json");
await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(WorkflowDefinitionSchema, null, 2)}\n`, "utf8");
