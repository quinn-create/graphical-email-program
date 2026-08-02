import { SecurityViolationError } from "./gmail-scopes.js";

const FORBIDDEN_DRIVE_ACTIONS = [
  "delete",
  "trash",
  "untrash",
  "emptyTrash",
  "update",
  "patch",
] as const;

export function assertDriveActionAllowed(action: string): void {
  const normalized = action.toLowerCase();
  if (
    (FORBIDDEN_DRIVE_ACTIONS as readonly string[]).includes(normalized) ||
    normalized.includes("delete") ||
    normalized.includes("trash")
  ) {
    throw new SecurityViolationError(
      `Drive action forbidden: ${action}`,
      "DRIVE_ACTION_FORBIDDEN",
    );
  }
}

export function assertDriveNoOverwrite(existingFileId: string | null | undefined): void {
  if (existingFileId) {
    throw new SecurityViolationError(
      "Drive overwrite of finalized audit files is forbidden",
      "DRIVE_OVERWRITE_FORBIDDEN",
    );
  }
}
