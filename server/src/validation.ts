// validation.ts
// Input validation and sanitization utilities for the Dirt server.
//
// Used by the API endpoints to ensure user-submitted data is safe and
// well-formed before it reaches the database or runtime. Covers:
//   - String sanitization (trim, length limits, dangerous character stripping)
//   - Numeric ID validation
//   - Program name and code validation with descriptive error messages

/** Maximum allowed length for a program name */
const MAX_NAME_LENGTH = 100;

/** Maximum allowed length for program source code (characters) */
const MAX_CODE_LENGTH = 50000;

/** Minimum allowed length for a program name */
const MIN_NAME_LENGTH = 1;


// ── Validation Result ────────────────────────────────────────────────────────

/** Returned by every validator — either a clean value or an error message */
export type ValidationResult<T> =
  | { ok: true;  value: T }
  | { ok: false; error: string };


// ── String Sanitization ──────────────────────────────────────────────────────

/**
 * Trim whitespace from both ends and collapse internal runs of whitespace
 * into single spaces. Strips null bytes and other control characters.
 */
export function sanitizeString(input: unknown): string {
  if (typeof input !== "string") return "";
  // Remove null bytes and ASCII control chars (except newline/tab in code)
  return input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
}


// ── Validators ───────────────────────────────────────────────────────────────

/**
 * Validate a numeric ID from a route parameter.
 * Must be a positive integer — rejects NaN, negative, zero, and floats.
 */
export function validateId(raw: unknown): ValidationResult<number> {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, error: "ID must be a positive integer." };
  }
  return { ok: true, value: id };
}


/**
 * Validate a program name.
 * Must be a non-empty string within the allowed length range.
 */
export function validateProgramName(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string" || raw.trim().length === 0) {
    return { ok: false, error: "Program name is required and must be a non-empty string." };
  }

  const cleaned = sanitizeString(raw);

  if (cleaned.length < MIN_NAME_LENGTH) {
    return { ok: false, error: `Program name must be at least ${MIN_NAME_LENGTH} character(s).` };
  }
  if (cleaned.length > MAX_NAME_LENGTH) {
    return { ok: false, error: `Program name must be ${MAX_NAME_LENGTH} characters or fewer.` };
  }

  return { ok: true, value: cleaned };
}


/**
 * Validate program source code.
 * Must be a string (can be empty for a blank program) within the size limit.
 */
export function validateProgramCode(raw: unknown): ValidationResult<string> {
  if (typeof raw !== "string") {
    return { ok: false, error: "Program code must be a string." };
  }

  // Code is NOT sanitized the same way as names — we preserve newlines,
  // tabs, and whitespace because they're meaningful in source code.
  // We only strip null bytes.
  const cleaned = raw.replace(/\x00/g, "");

  if (cleaned.length > MAX_CODE_LENGTH) {
    return { ok: false, error: `Program code must be ${MAX_CODE_LENGTH} characters or fewer.` };
  }

  return { ok: true, value: cleaned };
}


/**
 * Validate an optional ID field (used in the save endpoint).
 * Accepts null, undefined, or a valid positive integer.
 */
export function validateOptionalId(raw: unknown): ValidationResult<number | null> {
  if (raw === null || raw === undefined) {
    return { ok: true, value: null };
  }
  const result = validateId(raw);
  if (!result.ok) return result;
  return { ok: true, value: result.value };
}