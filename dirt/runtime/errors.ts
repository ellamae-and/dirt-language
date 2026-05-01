
// errors.ts
// Centralized error handling and logging for the Dirt runtime.
//
// Provides:
//   1. Typed error classes (LexError, ParseError, RuntimeError) so callers
//      can distinguish where a failure occurred.
//   2. An ErrorLogger that writes timestamped entries to a log file on the
//      server side, and stores entries in memory on the client side.
//   3. A formatError() helper that turns a raw Error + source into a
//      user-friendly message with line/column information.


// ── Typed Error Classes ──────────────────────────────────────────────────────
// Each carries the character offset in the source where the problem was found,
// which lets the IDE show accurate line/column info in the error bar.

/** Thrown when the lexer encounters an unexpected character or unterminated string */
export class LexError extends Error {
    constructor(message: string, public readonly offset: number) {
      super(message);
      this.name = "LexError";
    }
  }
  
  /** Thrown when the parser hits an unexpected token or missing syntax */
  export class ParseError extends Error {
    constructor(message: string, public readonly offset: number) {
      super(message);
      this.name = "ParseError";
    }
  }
  
  /** Thrown during interpretation — type mismatches, undefined vars, division by zero, etc. */
  export class RuntimeError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "RuntimeError";
    }
  }
  
  
  // ── Log Entry ────────────────────────────────────────────────────────────────
  
  /** One recorded error event with metadata */
  export interface LogEntry {
    timestamp: string;      // ISO 8601 datetime
    level: "error" | "warn" | "info";
    source: "lexer" | "parser" | "runtime" | "server" | "unknown";
    message: string;
    details?: string;       // optional stack trace or extra context
  }
  
  
  // ── Error Logger ─────────────────────────────────────────────────────────────
  // On the server, appends JSON lines to a log file.
  // In the browser (no `fs`), stores entries in an in-memory array that the
  // IDE can read for its debug panel.
  
  export class ErrorLogger {
    /** In-memory log buffer — always available regardless of environment */
    private entries: LogEntry[] = [];
  
    /** Optional file path for server-side persistent logging */
    private logFilePath: string | null = null;
  
    /** Lazy-loaded fs module (null in browser) */
    private fsModule: typeof import("node:fs") | null = null;
  
    /**
     * Create a logger.
     * @param logFilePath - If provided, errors are also appended to this file.
     *                      Pass null for browser-only in-memory logging.
     */
    constructor(logFilePath: string | null = null) {
      this.logFilePath = logFilePath;
  
      // Attempt to load Node's fs module; silently skip in browser environments
      if (logFilePath) {
        try {
          // Dynamic require avoids bundler errors in the browser build
          this.fsModule = require("node:fs");
        } catch {
          this.fsModule = null;
        }
      }
    }
  
    /**
     * Record an error entry.
     * Stores in memory and optionally appends to the log file.
     */
    log(
      level: LogEntry["level"],
      source: LogEntry["source"],
      message: string,
      details?: string
    ): void {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        source,
        message,
        details,
      };
  
      // Always keep in memory
      this.entries.push(entry);
  
      // Append to file if server-side logging is configured
      if (this.logFilePath && this.fsModule) {
        try {
          const line = JSON.stringify(entry) + "\n";
          this.fsModule.appendFileSync(this.logFilePath, line, "utf-8");
        } catch {
          // If file write fails, the in-memory copy still exists
        }
      }
    }
  
    /** Convenience: log an error-level entry */
    error(source: LogEntry["source"], message: string, details?: string): void {
      this.log("error", source, message, details);
    }
  
    /** Convenience: log a warning-level entry */
    warn(source: LogEntry["source"], message: string, details?: string): void {
      this.log("warn", source, message, details);
    }
  
    /** Convenience: log an info-level entry */
    info(source: LogEntry["source"], message: string, details?: string): void {
      this.log("info", source, message, details);
    }
  
    /** Return all recorded entries (most recent last) */
    getEntries(): LogEntry[] {
      return [...this.entries];
    }
  
    /** Clear the in-memory buffer */
    clear(): void {
      this.entries = [];
    }
  }
  
  
  // ── Source Location Helper ───────────────────────────────────────────────────
  
  /**
   * Convert a character offset in source code to a human-readable { line, col }.
   * Lines and columns are 1-indexed for display purposes.
   */
  export function offsetToLocation(source: string, offset: number): { line: number; col: number } {
    // Clamp offset to valid range
    const clamped = Math.min(Math.max(offset, 0), source.length);
    const before = source.slice(0, clamped);
    const lines = before.split("\n");
    return {
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    };
  }
  
  
  /**
   * Format any caught error into a display-friendly string.
   * If the error carries an offset and source is provided, includes line/col info.
   */
  export function formatError(err: unknown, source?: string): string {
    if (!(err instanceof Error)) return String(err);
  
    // If the error has an offset and we have source, add location info
    const offset = (err as any).offset;
    if (typeof offset === "number" && source) {
      const { line, col } = offsetToLocation(source, offset);
      return `[${err.name}] Line ${line}, Col ${col}: ${err.message}`;
    }
  
    return `[${err.name}] ${err.message}`;
  }