import type { AuditAction } from "../database/schema";

export interface AuditInput {
  actorUserId?: string | null;
  action: AuditAction;
  /** e.g. "client", "installation_request". */
  entityType: string;
  entityId: string | number;
  metadata?: Record<string, unknown> | null;
}

/**
 * Builds an audit_log row. Kept pure so the shape (and the "actor may be null"
 * rule for public actions) can be unit tested without a database.
 */
export function auditEntry(input: AuditInput) {
  return {
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: String(input.entityId),
    metadata: input.metadata ?? null,
  };
}