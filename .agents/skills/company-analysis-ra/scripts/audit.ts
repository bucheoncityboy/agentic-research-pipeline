import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build, prepare } from "./report.js";
import { assessResearch, coverageRows, evidenceFingerprint, rendererFingerprint } from "./quality.js";
import { pathsAlias } from "./files.js";

export function runAudit(args: string[]): number {
  const [path, flag] = args;
  if (!path || args.length > 2 || (flag !== undefined && flag !== "--final")) { console.error("Usage: npm run audit -- input.json [--final]"); return 1; }
  try {
    const input: unknown = JSON.parse(readFileSync(path, "utf8").replace(/^\uFEFF/, ""));
    const { report } = prepare(input); const { gate } = build(input);
    console.log(JSON.stringify({ gate, ...(report ? { evidenceSha256: evidenceFingerprint(report), rendererSha256: rendererFingerprint(), assessment: assessResearch(report), coverage: coverageRows(report) } : {}) }, null, 2));
    return gate.status === "FAIL" ? 1 : flag === "--final" && gate.research?.state !== "FINAL" ? 2 : 0;
  } catch (error: unknown) { console.error(JSON.stringify({ status: "FAIL", error: error instanceof Error ? error.message : String(error) })); return 1; }
}
if (process.argv[1] && pathsAlias(process.argv[1], fileURLToPath(import.meta.url))) process.exitCode = runAudit(process.argv.slice(2));
