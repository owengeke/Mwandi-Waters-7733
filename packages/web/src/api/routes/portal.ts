import { z } from "zod";
import { and, eq, inArray, ne } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { withUser } from "../middleware/auth";
import { db } from "../database";
import { clients, installationRequests } from "../database/schema";
import { kenyanPhone } from "../lib/validators";
import { createInstallationRequest } from "../lib/installations";
import { publicTrackingView } from "../lib/privacy";
import { HOME_FOR_ROLE, isRole } from "../lib/roles";

const OPEN = ["PENDING_REVIEW", "APPROVED_PENDING_PAYMENT", "PAID"] as const;

/** Public, unauthenticated procedures for the landing page + session helpers. */
export const portal = {
  /** Apply for a new water connection. One open request per phone number. */
  applyConnection: base
    .input(
      z.object({
        fullName: z.string().trim().min(2, "Enter your full name").max(120),
        phoneNumber: kenyanPhone,
        physicalAddress: z.string().trim().min(5, "Enter your plot / street and area").max(300),
      }),
    )
    .handler(async ({ input }) => {
      // A water account already exists for this phone: one phone = one login,
      // and multiple meters per person are out of scope for now. The public
      // response never reveals the account or application details.
      const [existingClient] = await db
        .select({ id: clients.id })
        .from(clients)
        .where(and(eq(clients.phoneNumber, input.phoneNumber), ne(clients.status, "DRAFT")));
      if (existingClient) {
        throw new ORPCError("CONFLICT", {
          message: "This phone number already has a water account. Sign in or contact us for help.",
        });
      }

      const [existing] = await db
        .select({ id: installationRequests.id })
        .from(installationRequests)
        .where(and(eq(installationRequests.phoneNumber, input.phoneNumber), inArray(installationRequests.status, [...OPEN])));
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: "An application with this phone number is already open. Use Track application to follow it.",
        });
      }
      const row = await createInstallationRequest(input);
      return { referenceNumber: row.referenceNumber, status: row.status, createdAt: row.createdAt };
    }),

  /**
   * Status lookup by reference. Public, so it returns only the reference, the
   * status and (while awaiting payment) the installation fee — never the
   * applicant's name, phone, address or estate.
   */
  trackApplication: base
    .input(z.object({ referenceNumber: z.string().trim().toUpperCase().regex(/^REQ-?\d{1,}$/, "Use the format REQ-0001") }))
    .handler(async ({ input }) => {
      const ref = `REQ-${input.referenceNumber.replace(/\D/g, "").padStart(4, "0")}`;
      const [row] = await db.select().from(installationRequests).where(eq(installationRequests.referenceNumber, ref));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No application found for ${ref}` });
      return publicTrackingView(row);
    }),

  /** Current session, role and where that role should land. */
  me: withUser.handler(({ context }) => {
    if (!context.user) return null;
    const role = isRole(context.user.role) ? context.user.role : "client";
    return { id: context.user.id, name: context.user.name, email: context.user.email, role, home: HOME_FOR_ROLE[role] };
  }),
};
