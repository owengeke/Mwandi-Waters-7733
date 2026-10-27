/**
 * Vercel serverless entry point.
 *
 * The Vercel project root is the repository root (not `packages/web`) so the
 * install step can run `bun install` against the workspace: npm cannot resolve
 * the `workspace:*` protocol used by `packages/desktop`. This file therefore
 * lives at the repo root and re-exports the real adapter.
 */
export { default } from "../packages/web/api/index";
