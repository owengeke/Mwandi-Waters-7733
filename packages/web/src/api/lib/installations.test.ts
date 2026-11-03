import { describe, expect, test } from "bun:test";
import { installationBlocker } from "./installation-rules";

describe("installationBlocker", () => {
  test("blocks installation until the public details are complete", () => {
    expect(
      installationBlocker({
        detailsCompletedAt: null,
        propertyType: "residential",
        occupantType: "owner",
      }),
    ).toBe("The client must complete their details before installation.");
  });

  test("still blocks when details are complete but the property profile is missing", () => {
    expect(
      installationBlocker({
        detailsCompletedAt: new Date(),
        propertyType: null,
        occupantType: null,
      }),
    ).toBe("The client's property details are incomplete.");
  });

  test("allows installation once every step is saved", () => {
    expect(
      installationBlocker({
        detailsCompletedAt: new Date(),
        propertyType: "commercial",
        occupantType: "tenant",
      }),
    ).toBeNull();
  });
});