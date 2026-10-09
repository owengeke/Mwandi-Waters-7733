import { eq } from "drizzle-orm";
import { db } from "../database";
import { installationRequests } from "../database/schema";
import { requestRef, pending } from "./identifiers";

export async function createInstallationRequest(input: { fullName: string; phoneNumber: string; physicalAddress: string }) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(installationRequests)
      .values({ ...input, referenceNumber: pending() })
      .returning();
    const [final] = await tx
      .update(installationRequests)
      .set({ referenceNumber: requestRef(row.id) })
      .where(eq(installationRequests.id, row.id))
      .returning();
    return final;
  });
}
