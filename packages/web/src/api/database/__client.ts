// TEMPLATE-MANAGED (__ prefix) — do not edit. Define tables in ./schema.ts
// and query via: import { db } from "./database";
import { createRequire } from "node:module";
import path from "node:path";
import { drizzle } from "drizzle-orm/libsql";
import { createClient as createRemoteClient } from "@libsql/client/web";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set");
}

/**
 * `libsql://` / `https://` databases (Turso) use the pure-JS HTTP client, which
 * works on serverless platforms where the native `libsql` addon cannot load.
 * The native client is resolved lazily and only for local `file:` URLs.
 */
function createClient() {
  const authToken = process.env.DATABASE_AUTH_TOKEN;

  if (!url!.startsWith("file:")) {
    return createRemoteClient({ url: url!, authToken });
  }

  // `createRequire` resolves from the current working directory, which keeps
  // this working under both ESM (local dev) and the CommonJS bundle Vercel emits.
  // `path.resolve` is used instead of `process.cwd()` because React Native's
  // ambient types (pulled in by the mobile typecheck) only declare `process.env`.
  const requireFrom = createRequire(path.resolve("index.js"));
  const { createClient: createLocalClient } = requireFrom("@libsql/client") as typeof import("@libsql/client");
  return createLocalClient({ url: url!, authToken });
}

export const db = drizzle(createClient(), { schema });
