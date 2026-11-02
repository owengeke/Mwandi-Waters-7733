/**
 * Local helper: run a hosted-DB script with DATABASE_URL/DATABASE_AUTH_TOKEN
 * loaded from the root .env (HOSTED_* keys), avoiding PowerShell env plumbing.
 *
 * Usage:
 *   bun scripts/run-hosted.ts <module-rel-path> [KEY=VALUE ...]
 *
 * Examples:
 *   bun scripts/run-hosted.ts export-hosted-snapshot.ts SNAPSHOT_PATH=C:\temp\pre.db
 *   bun scripts/run-hosted.ts migrate-hosted-0004.ts CONFIRM_HOSTED_MIGRATION=yes
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, "..", "..", "..", ".env");
const envText = readFileSync(envPath, "utf8");

function pick(key: string): string | undefined {
  for (const line of envText.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith(`${key}=`)) return t.slice(key.length + 1).trim();
  }
  return undefined;
}

const hostedUrl = pick("HOSTED_DATABASE_URL");
const hostedToken = pick("HOSTED_DATABASE_AUTH_TOKEN");
if (!hostedUrl) {
  console.error("ABORT: HOSTED_DATABASE_URL not found in .env");
  process.exit(1);
}
process.env.DATABASE_URL = hostedUrl;
process.env.DATABASE_AUTH_TOKEN = hostedToken;

const [target, ...pairs] = process.argv.slice(2);
if (!target) {
  console.error("ABORT: provide a module path, e.g. migrate-hosted-0004.ts");
  process.exit(1);
}
for (const pair of pairs) {
  const i = pair.indexOf("=");
  if (i > 0) process.env[pair.slice(0, i)] = pair.slice(i + 1);
}

console.log(`[run-hosted] target=${target} host=${hostedUrl.replace(/\/\/[^/]+/, "//***")}`);
console.log(`[run-hosted] env: ${pairs.join(" ") || "(none)"}`);

await import(pathToFileURL(resolve(here, target)).href);
