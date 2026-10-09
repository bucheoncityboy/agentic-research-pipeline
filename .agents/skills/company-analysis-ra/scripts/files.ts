import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { Gate } from "./schema.js";

interface Engine {
  build(input: unknown): { html: string | null; gate: Gate };
  verify(input: unknown, html: string): Gate;
  failedGate(message: string): Gate;
}
function canonical(path: string): string {
  let current = resolve(path); const suffix: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current); if (parent === current) break;
    suffix.unshift(basename(current)); current = parent;
  }
  const resolved = join(realpathSync.native(current), ...suffix);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
export function pathsAlias(left: string, right: string): boolean {
  if (canonical(left) === canonical(right)) return true;
  if (existsSync(left) && existsSync(right)) {
    const a = statSync(left); const b = statSync(right);
    return a.isFile() && b.isFile() && a.ino !== 0 && a.dev === b.dev && a.ino === b.ino;
  }
  return false;
}
function preflight(outputPath: string, gatePath: string): void {
  for (const path of [outputPath, gatePath]) if (existsSync(path) && !statSync(path).isFile()) throw new Error(`Output must be a file: ${path}`);
  mkdirSync(dirname(outputPath), { recursive: true });
}
function writePair(outputPath: string, gatePath: string, html: string | null, gate: Gate): void {
  preflight(outputPath, gatePath);
  const suffix = `${randomUUID()}.tmp`;
  const htmlTemp = `${outputPath}.${suffix}`; const gateTemp = `${gatePath}.${suffix}`;
  const priorHtml = html !== null && existsSync(outputPath) ? readFileSync(outputPath) : null;
  let htmlCommitted = false;
  try {
    if (html !== null) writeFileSync(htmlTemp, html, { encoding: "utf8", flag: "wx" });
    writeFileSync(gateTemp, `${JSON.stringify(gate, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    if (html !== null) { renameSync(htmlTemp, outputPath); htmlCommitted = true; }
    renameSync(gateTemp, gatePath);
  } catch (error: unknown) {
    if (htmlCommitted) {
      if (priorHtml === null) rmSync(outputPath, { force: true });
      else { writeFileSync(htmlTemp, priorHtml, { flag: "wx" }); renameSync(htmlTemp, outputPath); }
    }
    throw error;
  } finally {
    for (const temp of [htmlTemp, gateTemp]) if (existsSync(temp)) rmSync(temp, { force: true });
  }
}
export function runCli(args: string[], engine: Engine): number {
  const [command, inputPath, outputPath] = args;
  if (args.length !== 3 || !["build", "verify"].includes(command ?? "") || !inputPath || !outputPath) {
    console.error("Usage: npm run build|verify -- input.json output.html (from the skill folder)"); return 1;
  }
  try {
    const inputFile = resolve(inputPath); const outputFile = resolve(outputPath); const gatePath = `${outputFile}.gate.json`;
    if (pathsAlias(inputFile, outputFile) || pathsAlias(inputFile, gatePath) || pathsAlias(outputFile, gatePath)) throw new Error("Input, HTML and gate paths must be distinct files, including case and link aliases");
    preflight(outputFile, gatePath);
    let html: string | null = null; let gate: Gate;
    try {
      const input: unknown = JSON.parse(readFileSync(inputFile, "utf8").replace(/^\uFEFF/, ""));
      if (command === "build") { const result = engine.build(input); html = result.html; gate = result.gate; }
      else gate = engine.verify(input, readFileSync(outputFile, "utf8"));
    } catch (error: unknown) { gate = engine.failedGate(error instanceof Error ? error.message : String(error)); }
    writePair(outputFile, gatePath, html, gate);
    console.log(JSON.stringify({ status: gate.status, errors: gate.errors, warnings: gate.warnings, outputWritten: html !== null, gatePath }, null, 2));
    return gate.status === "FAIL" ? 1 : 0;
  } catch (error: unknown) {
    console.error(JSON.stringify({ status: "FAIL", outputWritten: false, error: error instanceof Error ? error.message : String(error) }, null, 2)); return 1;
  }
}
