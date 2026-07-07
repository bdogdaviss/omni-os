// Shared helpers for duplicate detection across API routes.

// Normalize text for duplicate comparison:
// trim, lowercase, and collapse repeated whitespace.
export function normalizeText(value?: string | null): string {
  if (!value) {
    return "";
  }

  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

type DatabaseErrorLike = {
  code?: string | null;
  message?: string | null;
};

// Detect a Postgres unique violation (code 23505) from a Supabase error.
export function isDuplicateDatabaseError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as DatabaseErrorLike;

  if (candidate.code === "23505") {
    return true;
  }

  return (
    typeof candidate.message === "string" &&
    candidate.message.toLowerCase().includes("duplicate key value")
  );
}
