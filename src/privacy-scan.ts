import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type Finding = { scope: "working-tree" | "history" | "git-metadata"; location: string; category: string; count: number };
type Rule = { category: string; pattern: RegExp };
const root = fileURLToPath(new URL("..", import.meta.url));
const findings: Finding[] = [];
const rules: Rule[] = [
  { category: "credential-token", pattern: /\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|AIza[A-Za-z0-9_-]{30,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g },
  { category: "private-key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { category: "authorization-header", pattern: /authorization:\s*(?:basic|bearer)\s+[A-Za-z0-9+/_=-]{12,}/gi },
  { category: "credential-assignment", pattern: /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["'][^"'\s]{12,}["']/gi },
  { category: "personal-email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { category: "korean-mobile", pattern: /(?<!\d)(?:\+82[- .]?)?01[016789][- .]?\d{3,4}[- .]?\d{4}(?!\d)/g },
  { category: "resident-number", pattern: /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[- ]?[1-8]\d{6}(?!\d)/g },
  { category: "personal-machine-path", pattern: /(?:[A-Z]:[\\/]+Users[\\/]+[^\s<>"']+|\/(?:Users|home)\/[^\s<>"']+)/gi },
  { category: "local-file-link", pattern: /file:\/\/[^\s<>"']+/gi },
  { category: "private-ip", pattern: /\b(?:192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})\b/g },
];
const personalTerms: string[] = [];
for (let index = 2; index < process.argv.length; index++) {
  if (process.argv[index] === "--personal-term") {
    const term = process.argv[++index];
    if (!term) throw new Error("--personal-term requires a value");
    personalTerms.push(term);
  } else throw new Error("Unknown argument");
}
function git(args: string[], input?: string): Buffer {
  const result = spawnSync("git", args, { cwd: root, maxBuffer: 64 * 1024 * 1024, ...(input === undefined ? {} : { input }) });
  if (result.status !== 0) throw new Error(`Git inspection failed: ${args[0]}`);
  return result.stdout;
}
function githubNoreply(email: string): boolean {
  return email === "noreply@github.com" || /^[^@]+@(?:users\.)?noreply\.github\.com$/i.test(email);
}
function scan(text: string, scope: Finding["scope"], location: string): void {
  for (const rule of rules) {
    const count = [...text.matchAll(rule.pattern)].filter((match) => rule.category !== "personal-email" || !githubNoreply(match[0])).length;
    if (count) findings.push({ scope, location, category: rule.category, count });
  }
  for (const term of personalTerms) {
    const count = text.split(term).length - 1;
    if (count) findings.push({ scope, location, category: "user-supplied-personal-term", count });
  }
}
const extractionCache = new Map<string, string>();
const extractionIssues: Array<{ location: string; tool: string }> = [];
const pdfMetadata: Array<{ location: string; authorFieldPresent: boolean }> = [];
const scratch = mkdtempSync(resolve(tmpdir(), "research-privacy-"));
function inspect(bytes: Buffer, scope: Finding["scope"], location: string): void {
  scan(location, scope, `${location} (filename)`);
  if (/(?:이력서|자기소개서|입사지원서|동의서|(?:^|[\/_.-])resume(?:[\/_.-]|$))/i.test(location)) {
    findings.push({ scope, location, category: "personal-document-name", count: 1 });
  }
  const fingerprint = createHash("sha256").update(bytes).digest("hex");
  let text = extractionCache.get(fingerprint);
  if (text === undefined) {
    if (bytes.subarray(0, 5).toString() === "%PDF-") {
      const path = resolve(scratch, `${fingerprint}.pdf`);
      writeFileSync(path, bytes);
      const outputs: string[] = [];
      for (const [tool, args] of [["pdftotext", ["-enc", "UTF-8", path, "-"]], ["pdfinfo", [path]], ["pdfinfo", ["-meta", path]]] as const) {
        const result = spawnSync(tool, [...args], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 30_000 });
        if (result.status !== 0) extractionIssues.push({ location, tool });
        else outputs.push(result.stdout);
      }
      text = outputs.join("\n");
      pdfMetadata.push({ location, authorFieldPresent: /^Author:\s*\S/m.test(text) });
    } else {
      // PNG pixels are reviewed visually; metadata and other blobs are scanned too.
      text = bytes.toString("utf8");
    }
    extractionCache.set(fingerprint, text);
  }
  scan(text, scope, location);
}

const files = git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"]).toString("utf8").split("\0").filter(Boolean);
const ignoredFiles = git(["ls-files", "--others", "--ignored", "--exclude-standard", "-z"]).toString("utf8").split("\0").filter(Boolean);
const ignoredSensitiveFiles = ignoredFiles.filter((path) => !/(?:^|\/)(?:node_modules|results|dist)\//.test(path) && /(?:^|\/)(?:\.env(?:\.|$)|credentials\.json$|service-account[^/]*\.json$|id_(?:rsa|ed25519)$|private\/|\.local\/)|\.(?:pem|key|p12|pfx)$|이력서|자기소개서|입사지원서|동의서/i.test(path));
for (const path of ignoredSensitiveFiles) {
  findings.push({ scope: "working-tree", location: path, category: "ignored-sensitive-file", count: 1 });
  inspect(readFileSync(resolve(root, path)), "working-tree", path);
}
let workingFiles = 0;
for (const file of files) {
  const path = resolve(root, file);
  if (!existsSync(path)) continue;
  workingFiles++;
  inspect(readFileSync(path), "working-tree", file);
}
const objects = git(["-c", "core.quotepath=false", "rev-list", "--objects", "--all"]).toString("utf8").trim().split("\n").filter(Boolean);
let historyBlobs = 0;
for (const object of objects) {
  const split = object.indexOf(" ");
  if (split < 0) continue;
  const oid = object.slice(0, split); const path = object.slice(split + 1);
  if (git(["cat-file", "-t", oid]).toString("utf8").trim() !== "blob") continue;
  historyBlobs++;
  inspect(git(["cat-file", "blob", oid]), "history", `${oid.slice(0, 12)}:${path}`);
}
const commits = git(["log", "--all", "--format=%H%x09%an%x09%ae%x09%cn%x09%ce"]).toString("utf8").trim().split("\n").filter(Boolean);
for (const commit of commits) {
  const [oid, authorName, authorEmail, committerName, committerEmail] = commit.split("\t");
  const personalEmails = new Set([authorEmail, committerEmail].filter((email) => email !== undefined && !githubNoreply(email)));
  if (personalEmails.size) findings.push({ scope: "git-metadata", location: oid?.slice(0, 12) ?? "commit", category: "non-noreply-commit-email", count: personalEmails.size });
  if (personalTerms.some((term) => `${authorName ?? ""} ${committerName ?? ""}`.includes(term))) {
    findings.push({ scope: "git-metadata", location: oid?.slice(0, 12) ?? "commit", category: "user-supplied-personal-term", count: 1 });
  }
}
const report = { checkedAt: new Date().toISOString(), workingFiles, historyBlobs, commits: commits.length, ignoredSensitiveFiles: ignoredSensitiveFiles.length, findings, pdfMetadata, extractionIssues,
  limits: ["Pattern matches require review; absence of matches does not prove absence of all personal data.", "Git identities remain attribution metadata; addresses are never printed.", "PNG pixel content requires visual review."] };
mkdirSync(resolve(root, "results"), { recursive: true });
writeFileSync(resolve(root, "results/privacy-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify(report, null, 2));
if (extractionIssues.length) process.exitCode = 1;
