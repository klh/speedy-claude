#!/usr/bin/env bun
// approve-skill — mint a signed, single-use skill-install approval.
// Bun/TS only (replaces bash version).
import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const HOME = process.env.HOME!;
const SECRET_FILE = `${HOME}/.claude/.skill-review-secret`;
const DIR = `${HOME}/.claude-insights/.approvals`;

const source = process.argv[2];
if (!source) {
  console.error("Usage: bun approve-skill.ts <source-ref>");
  console.error('Example: bun approve-skill.ts "alisonaquinas/llm-shared-skills@v1.8.1/zsh"');
  process.exit(1);
}

if (!existsSync(SECRET_FILE)) {
  console.error("No secret. Generate with:");
  console.error(`  head -c 32 /dev/urandom | xxd -p -c 32 > ${SECRET_FILE}; chmod 600 ${SECRET_FILE}`);
  process.exit(1);
}

mkdirSync(DIR, { recursive: true });
const secret = readFileSync(SECRET_FILE, "utf8").trim();
const ts = Math.floor(Date.now() / 1000);
const sig = createHmac("sha256", secret).update(`${source}|${ts}`).digest("hex");

const file = `${DIR}/${ts}.approval`;
writeFileSync(file, `src=${source}\nts=${ts}\nsig=${sig}\n`);

console.log(`✓ approval minted for: ${source}`);
console.log(`  file: ${file}`);
console.log(`  expires: ${new Date((ts + 86400) * 1000).toLocaleString()}`);
