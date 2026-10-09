import { z } from "zod";
import { and, eq, inArray } from "drizzle-orm";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { withUser } from "../middleware/auth";
import { db } from "../database";
import { installationRequests } from "../database/schema";
import { kenyanPhone } from "../lib/validators";
import { createInstallationRequest } from "../lib/installations";
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
      const [existing] = await db
        .select({ ref: installationRequests.referenceNumber })
        .from(installationRequests)
        .where(and(eq(installationRequests.phoneNumber, input.phoneNumber), inArray(installationRequests.status, [...OPEN])));
      if (existing) {
        throw new ORPCError("CONFLICT", {
          message: `You already have an open application (${existing.ref}). Use Track Application to follow it.`,
          data: { referenceNumber: existing.ref },
        });
      }
      const row = await createInstallationRequest(input);
      return { referenceNumber: row.referenceNumber, status: row.status, createdAt: row.createdAt };
    }),

  /** Status lookup by reference. Returns no contact details or address. */
  trackApplication: base
    .input(z.object({ referenceNumber: z.string().trim().toUpperCase().regex(/^REQ-?\d{1,}$/, "Use the format REQ-0001") }))
    .handler(async ({ input }) => {
      const ref = `REQ-${input.referenceNumber.replace(/\D/g, "").padStart(4, "0")}`;
      const [row] = await db.select().from(installationRequests).where(eq(installationRequests.referenceNumber, ref));
      if (!row) throw new ORPCError("NOT_FOUND", { message: `No application found for ${ref}` });
      const [first, ...rest] = row.fullName.split(/\s+/);
      return {
        referenceNumber: row.referenceNumber,
        applicant: `${first}${rest.length ? ` ${rest.at(-1)![0]}.` : ""}`,
        status: row.status,
        installationFeeKes: row.status === "APPROVED_PENDING_PAYMENT" ? row.installationFeeKes : null,
        rejectionReason: row.status === "REJECTED" ? row.rejectionReason : null,
        submittedAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    }),

  /** Current session, role and where that role should land. */
  me: withUser.handler(({ context }) => {
    if (!context.user) return null;
    const role = isRole(context.user.role) ? context.user.role : "client";
    return { id: context.user.id, name: context.user.name, email: context.user.email, role, home: HOME_FOR_ROLE[role] };
  }),
};
