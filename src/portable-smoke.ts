import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Run through npm so npm_execpath selects the same installed npm on every OS.
const npmCli = process.env.npm_execpath;
assert.ok(npmCli, "Run this check with npm run smoke:portable");
const root = fileURLToPath(new URL("..", import.meta.url));
const source = resolve(root, ".agents/skills/company-analysis-ra");
const workspace = mkdtempSync(resolve(tmpdir(), "company-ra-portable-"));
const destination = resolve(workspace, "한글 경로 with spaces", "company-analysis-ra");
const manifest: unknown = JSON.parse(readFileSync(resolve(source, "package.json"), "utf8"));
assert.ok(manifest && typeof manifest === "object" && "files" in manifest);
const files = manifest.files;
assert.ok(Array.isArray(files) && files.every((entry: unknown) => typeof entry === "string"));

function npm(args: string[], cwd: string): string {
  const result = spawnSync(process.execPath, [npmCli!, ...args], {
    cwd, encoding: "utf8", timeout: 180_000,
    env: { ...process.env, NODE_PATH: "", NODE_ENV: "development" },
  });
  assert.equal(result.status, 0, `${args.join(" ")}\n${result.error?.message ?? ""}\n${result.stderr}\n${result.stdout}`);
  return result.stdout;
}

function copyResource(from: string, to: string): void {
  if (statSync(from).isDirectory()) {
    mkdirSync(to, { recursive: true });
    for (const entry of readdirSync(from)) copyResource(resolve(from, entry), resolve(to, entry));
  } else {
    copyFileSync(from, to);
  }
}

try {
  // Copy only the distributable files: no repo tooling or existing node_modules.
  mkdirSync(destination, { recursive: true });
  for (const entry of ["package.json", ...files as string[]]) {
    copyResource(resolve(source, entry), resolve(destination, entry));
  }
  npm(["ci", "--no-audit", "--no-fund"], destination);
  npm(["run", "typecheck"], destination);
  npm(["run", "example"], destination);
  const input = resolve(destination, "fixtures/example.json");
  const output = resolve(destination, "results/example.html");
  npm(["--prefix", destination, "run", "verify", "--", input, output], workspace);

  // A runtime-only install must still contain tsx and the renderer's packages.
  npm(["ci", "--omit=dev", "--no-audit", "--no-fund"], destination);
  const externalOutput = resolve(workspace, "작업 결과", "report.html");
  npm(["--prefix", destination, "run", "build", "--", input, externalOutput], workspace);
  npm(["--prefix", destination, "run", "verify", "--", input, externalOutput], workspace);
  const gate = JSON.parse(readFileSync(`${externalOutput}.gate.json`, "utf8")) as { status: string; errors: string[] };
  assert.equal(gate.status, "PARTIAL");
  assert.deepEqual(gate.errors, []);

  // npm excludes package-lock.json even when listed; shrinkwrap must ship instead.
  const archive: unknown = JSON.parse(npm(["pack", "--dry-run", "--json"], destination));
  assert.ok(Array.isArray(archive) && archive[0] && typeof archive[0] === "object");
  const packedFiles = archive[0].files as Array<{ path: string }>;
  const paths = packedFiles.map((entry) => entry.path);
  for (const required of ["SKILL.md", "npm-shrinkwrap.json", "scripts/report.ts", "assets/template.html", "references/setup.md"]) {
    assert.ok(paths.includes(required), `Archive omits ${required}`);
  }
  assert.ok(paths.every((path) => !/^(?:node_modules|results|src)\//.test(path)), "Archive includes environment files");
  console.log(JSON.stringify({ status: "PASS", checks: ["isolated install", "typecheck", "build and verify", "runtime-only install", "external working directory", "archive contents"], workspace }, null, 2));
} catch (error: unknown) {
  console.error(`Portable check artifacts: ${workspace}`);
  throw error;
}
