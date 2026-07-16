import { resolve } from "node:path";
import { runDemoLayoutQa, startStaticDemoServer } from "./demo-layout-qa-lib.mjs";

function values(name) {
  return process.argv.flatMap((value, index) =>
    value === name && process.argv[index + 1] !== undefined ? [process.argv[index + 1]] : []
  );
}

let url = values("--url")[0];
const directory = values("--directory")[0];
if (url === undefined && directory === undefined) {
  throw new Error(
    "usage: npm run qa:demo-layout -- (--url <demo-url> | --directory <demo-directory>) [--screen screen-id]"
  );
}

const staticDemo = directory === undefined ? undefined : await startStaticDemoServer(directory);
if (staticDemo !== undefined) url = staticDemo.url;
let result;
try {
  result = await runDemoLayoutQa({
    url,
    screens: values("--screen"),
    outputDirectory: resolve(values("--output")[0] ?? "tmp/demo-layout-qa")
  });
} finally {
  await staticDemo?.close();
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (!result.ok) process.exitCode = 1;
