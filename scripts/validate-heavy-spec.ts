import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { digestWorkflow } from "../packages/ir/src/index.js";
import {
  createHeavyProductionSpecValidator,
  HEAVY_PRODUCTION_SPEC_PROFILE_ID
} from "../workflows/templates/spec-feedback-to-spec/src/index.js";

const path = resolve(process.argv[2] ?? "refined-production-spec.json");
const document = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
const findings = createHeavyProductionSpecValidator(document)(document);
const report = {
  profileId: HEAVY_PRODUCTION_SPEC_PROFILE_ID,
  path,
  contentDigest: digestWorkflow(document),
  counts: {
    screens: Array.isArray(document.screens) ? document.screens.length : 0,
    components: Array.isArray(document.components) ? document.components.length : 0,
    actors: Array.isArray(document.actors) ? document.actors.length : 0
  },
  status: findings.length === 0 ? "passed" : "failed",
  findings
};

console.log(JSON.stringify(report, null, 2));
if (findings.length > 0) process.exitCode = 1;
