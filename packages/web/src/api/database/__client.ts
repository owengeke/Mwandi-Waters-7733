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

  // `import.meta.url` is undefined if a bundler emits CommonJS; fall back to cwd.
  const requireFrom = createRequire(import.meta.url ?? path.join(process.cwd(), "index.js"));
  const { createClient: createLocalClient } = requireFrom("@libsql/client") as typeof import("@libsql/client");
  return createLocalClient({ url: url!, authToken });
}

export const db = drizzle(createClient(), { schema });
