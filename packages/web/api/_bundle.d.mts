/**
 * Types for `_bundle.mjs`, which `bun run build:api` generates from
 * `src/api/index.ts`. Only the surface the Vercel adapter uses is declared.
 */
declare const app: {
  fetch(request: Request): Response | Promise<Response>;
};

export default app;
