import type { RouterClient } from "@orpc/server";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { ping } from "./routes/ping";
import { portal } from "./routes/portal";
import { account } from "./routes/account";
import { dashboard } from "./routes/dashboard";
import { installations } from "./routes/installations";
import { clients } from "./routes/clients";
import { invoices } from "./routes/invoices";
import { payments } from "./routes/payments";

// Mwandi Waters API — oRPC procedures served at /api/rpc/*
//   portal  → public (landing page) + session info
//   account → role: client (own data only)
//   dashboard / installations / clients / invoices / payments → roles: super_admin, admin, staff
export const router = {
  ping,
  portal,
  account,
  dashboard,
  installations,
  clients,
  invoices,
  payments,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);
// Better Auth (incl. unified portal sign-in at /api/auth/portal/*)
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

export default app;
