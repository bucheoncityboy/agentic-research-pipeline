import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { linkSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFixture } from "./fixture.js";

export function runFileCases(): number {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const directory = mkdtempSync(resolve(tmpdir(), "company-ra-files-"));
  const inputPath = resolve(directory, "input.json"); const text = JSON.stringify(createFixture()); writeFileSync(inputPath, text, "utf8");
  const invoke = (command: string, input: string, output: string) => spawnSync(process.execPath, ["--import", "tsx", resolve(root, ".agents/skills/company-analysis-ra/scripts/report.ts"), command, input, output], { cwd: root, encoding: "utf8" });
  let cases = 0;
  const check = (name: string, run: () => void): void => { run(); cases++; console.log(`PASS files: ${name}`); };
  check("UTF-8 BOM and spaces in output path", () => { const bom = resolve(directory, "bom.json"); writeFileSync(bom, `\uFEFF${text}`, "utf8"); const output = resolve(directory, "folder with spaces", "기업 분석.html"); const result = invoke("build", bom, output); assert.equal(result.status, 0, result.stderr + result.stdout); assert.match(readFileSync(output, "utf8"), /Company Analysis RA/); });
  check("malformed JSON produces FAIL gate and no HTML", () => { const malformed = resolve(directory, "malformed.json"); writeFileSync(malformed, "{broken", "utf8"); const output = resolve(directory, "malformed.html"); const result = invoke("build", malformed, output); assert.equal(result.status, 1); assert.equal((JSON.parse(readFileSync(`${output}.gate.json`, "utf8")) as { status: string }).status, "FAIL"); assert.ok(!readdirSync(directory).includes("malformed.html")); });
  check("hard-link output cannot overwrite source JSON", () => { const output = resolve(directory, "alias.html"); linkSync(inputPath, output); const result = invoke("build", inputPath, output); assert.equal(result.status, 1); assert.equal(readFileSync(inputPath, "utf8"), text); assert.match(result.stderr, /distinct files/); });
  check("hard-link gate cannot overwrite source JSON", () => { const output = resolve(directory, "gate-alias.html"); linkSync(inputPath, `${output}.gate.json`); const result = invoke("build", inputPath, output); assert.equal(result.status, 1); assert.equal(readFileSync(inputPath, "utf8"), text); });
  check("HTML and gate alias are rejected", () => { const output = resolve(directory, "shared.html"); writeFileSync(output, "previous", "utf8"); linkSync(output, `${output}.gate.json`); const result = invoke("build", inputPath, output); assert.equal(result.status, 1); assert.equal(readFileSync(output, "utf8"), "previous"); });
  check("gate directory failure preserves previous HTML", () => { const output = resolve(directory, "preserve.html"); writeFileSync(output, "previous valid output", "utf8"); mkdirSync(`${output}.gate.json`); const result = invoke("build", inputPath, output); assert.equal(result.status, 1); assert.equal(readFileSync(output, "utf8"), "previous valid output"); });
  check("unwritable parent type returns structured FAIL", () => { const parent = resolve(directory, "file-as-parent"); writeFileSync(parent, "keep", "utf8"); const result = invoke("build", inputPath, resolve(parent, "output.html")); assert.equal(result.status, 1); assert.match(result.stderr, /"status": "FAIL"/); assert.equal(readFileSync(parent, "utf8"), "keep"); });
  check("failed build preserves existing HTML and flags current gate", () => { const output = resolve(directory, "old.html"); writeFileSync(output, "old", "utf8"); const invalid = resolve(directory, "invalid.json"); writeFileSync(invalid, "null", "utf8"); const result = invoke("build", invalid, output); assert.equal(result.status, 1); assert.equal(readFileSync(output, "utf8"), "old"); assert.match(result.stdout, /"outputWritten": false/); });
  if (process.platform === "win32") check("Windows casing alias cannot overwrite input", () => { const result = invoke("build", inputPath, inputPath.toUpperCase()); assert.equal(result.status, 1); assert.equal(readFileSync(inputPath, "utf8"), text); });
  check("atomic writes leave no temporary artifacts", () => { assert.ok(!readdirSync(directory).some((name) => name.endsWith(".tmp"))); });
  return cases;
}
