import { describe, expect, test } from "bun:test";
import { auditEntry } from "./audit";

describe("auditEntry", () => {
  test("records the actor, action, entity and metadata", () => {
    expect(
      auditEntry({
        actorUserId: "user_123",
        action: "client.created",
        entityType: "client",
        entityId: 42,
        metadata: { accountNumber: "ACC-0042" },
      }),
    ).toEqual({
      actorUserId: "user_123",
      action: "client.created",
      entityType: "client",
      entityId: "42",
      metadata: { accountNumber: "ACC-0042" },
    });
  });

  test("allows a null actor for public/self-service actions", () => {
    expect(
      auditEntry({
        action: "details.completed",
        entityType: "installation_request",
        entityId: "REQ-0042",
      }),
    ).toEqual({
      actorUserId: null,
      action: "details.completed",
      entityType: "installation_request",
      entityId: "REQ-0042",
      metadata: null,
    });
  });
});