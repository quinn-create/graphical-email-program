/**
 * Single configurable product identity.
 * Change PRODUCT_NAME here — do not search/replace across the codebase.
 */
export const PRODUCT = {
  id: "mattermail-review",
  name: "MatterMail Review",
  shortName: "MatterMail",
  version: "0.1.0",
  auditRootFolderName: "MatterMail Audit",
  displayTimezone: "America/New_York",
} as const;

export type ProductConfig = typeof PRODUCT;
