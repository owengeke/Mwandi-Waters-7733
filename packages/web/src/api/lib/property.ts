import type { OccupantType, PropertyType } from "../database/schema";

export interface OccupancyInput {
  propertyType?: PropertyType | null;
  occupantType?: OccupantType | null;
  landlordPhone?: string | null;
}

export interface Occupancy {
  propertyType: PropertyType | null;
  occupantType: OccupantType | null;
  landlordPhone: string | null;
}

/**
 * The single source of truth for who occupies a property.
 *
 * Residential premises are always owner-occupied, so the occupant choice and any
 * landlord phone are dropped (the occupant is stored as `owner` rather than left
 * blank, so step/installation "details complete" checks keep working).
 * Only commercial premises can be tenanted, and only a tenant keeps a landlord
 * phone — a commercial owner drops it too.
 *
 * The API uses this to ignore bad combinations a client may still send; the forms
 * use it to keep the visible fields and the payload in step with each other.
 */
export function normalizeOccupancy(input: OccupancyInput): Occupancy {
  const propertyType = input.propertyType ?? null;

  if (propertyType === null) {
    return { propertyType: null, occupantType: null, landlordPhone: null };
  }

  if (propertyType === "residential") {
    return { propertyType, occupantType: "owner", landlordPhone: null };
  }

  const tenanted = input.occupantType === "tenant";
  return {
    propertyType,
    occupantType: tenanted ? "tenant" : "owner",
    landlordPhone: tenanted ? (input.landlordPhone ?? null) : null,
  };
}
