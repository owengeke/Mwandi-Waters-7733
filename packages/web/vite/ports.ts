import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Ports are assigned by the Runable sandbox and mirrored in `.runable/ports.json`
 * at the repo root. On Vercel only `packages/web` is uploaded, so the repo root
 * (and that file) may not exist. Fall back to the documented default instead of
 * importing `../../__ports.cjs`, which breaks the build there.
 */
export const repoRoot = (() => {
  const candidate = path.resolve(__dirname, "../..");
  return existsSync(path.join(candidate, "package.json")) ? candidate : path.resolve(__dirname, "..");
})();

const fallback = { website: 4200, mobile: 4300, desktop: 4400 };

export const ports: typeof fallback = (() => {
  try {
    const file = path.join(repoRoot, ".runable", "ports.json");
    if (existsSync(file)) {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as Partial<typeof fallback>;
      return { ...fallback, ...parsed };
    }
  } catch {
    // Ignore malformed/missing port config; the defaults are safe.
  }
  return fallback;
})();
