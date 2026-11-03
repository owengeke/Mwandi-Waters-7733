import { describe, expect, test } from "bun:test";
import { normalizeOccupancy } from "./property";

describe("normalizeOccupancy", () => {
  test("residential is always owner-occupied and drops the landlord phone", () => {
    expect(
      normalizeOccupancy({
        propertyType: "residential",
        occupantType: "owner",
        landlordPhone: "+254733000111",
      }),
    ).toEqual({ propertyType: "residential", occupantType: "owner", landlordPhone: null });
  });

  test("a tenant choice on a residential property is ignored", () => {
    expect(
      normalizeOccupancy({
        propertyType: "residential",
        occupantType: "tenant",
        landlordPhone: "+254733000111",
      }),
    ).toEqual({ propertyType: "residential", occupantType: "owner", landlordPhone: null });
  });

  test("residential with no occupant still stores the implied owner", () => {
    expect(normalizeOccupancy({ propertyType: "residential" })).toEqual({
      propertyType: "residential",
      occupantType: "owner",
      landlordPhone: null,
    });
  });

  test("commercial tenants keep an optional landlord phone", () => {
    expect(
      normalizeOccupancy({
        propertyType: "commercial",
        occupantType: "tenant",
        landlordPhone: "+254733000111",
      }),
    ).toEqual({ propertyType: "commercial", occupantType: "tenant", landlordPhone: "+254733000111" });

    expect(normalizeOccupancy({ propertyType: "commercial", occupantType: "tenant" })).toEqual({
      propertyType: "commercial",
      occupantType: "tenant",
      landlordPhone: null,
    });
  });

  test("commercial owners never keep a landlord phone", () => {
    expect(
      normalizeOccupancy({
        propertyType: "commercial",
        occupantType: "owner",
        landlordPhone: "+254733000111",
      }),
    ).toEqual({ propertyType: "commercial", occupantType: "owner", landlordPhone: null });
  });

  test("commercial with no occupant defaults to owner", () => {
    expect(normalizeOccupancy({ propertyType: "commercial" })).toEqual({
      propertyType: "commercial",
      occupantType: "owner",
      landlordPhone: null,
    });
  });

  test("an empty property type clears every property field", () => {
    expect(normalizeOccupancy({})).toEqual({ propertyType: null, occupantType: null, landlordPhone: null });
    expect(
      normalizeOccupancy({ propertyType: null, occupantType: "tenant", landlordPhone: "+254733000111" }),
    ).toEqual({ propertyType: null, occupantType: null, landlordPhone: null });
  });
});
