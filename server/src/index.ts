// index.ts
// Express REST API server for the Dirt Web IDE.
//
// Handles CRUD operations for saved programs via a SQLite database.
// All endpoints validate input, return descriptive error messages on failure,
// and log errors to both an in-memory buffer and a persistent log file.

import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { Database } from "./database.js";
import { Program } from "./program.js";
import {
  validateId,
  validateOptionalId,
  validateProgramName,
  validateProgramCode,
} from "./validation.js";


// ── Constants ────────────────────────────────────────────────────────────────

const PORT = 3000;

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Database Setup ───────────────────────────────────────────────────────────
const db = new Database();
db.Connect();

// Create the programs table if it doesn't already exist
db.Execute(`
  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);


// ── Error Logger ─────────────────────────────────────────────────────────────
// Minimal logger that writes timestamped JSON lines to a log file
// and keeps entries in memory. Lives here so the server has no
// cross-package imports into dirt/.

const LOG_FILE = path.resolve(process.cwd(), "../data/error.log");

/** One recorded error event */
interface LogEntry {
  timestamp: string;
  level: "error" | "warn" | "info";
  message: string;
  details?: string;
}

const logEntries: LogEntry[] = [];

function logEvent(level: LogEntry["level"], message: string, details?: string) {
  const entry: LogEntry = { timestamp: new Date().toISOString(), level, message, details };
  logEntries.push(entry);

  // Append to log file — create the directory if it doesn't exist
  try {
    const dir = path.dirname(LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + "\n", "utf-8");
  } catch { /* file write failed — in-memory copy still exists */ }
}

logEvent("info", `Dirt server starting on port ${PORT}`);


// ── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /programs
 * Returns all saved programs for the IDE dropdown.
 */
app.get("/programs", (_req, res) => {
  try {
    const programs = Program.ListAll(db);
    res.json(programs);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", "Failed to list programs", message);
    res.status(500).json({ error: "Could not retrieve programs. Please try again." });
  }
});


/**
 * GET /programs/:id
 * Returns one program by its ID.
 */
app.get("/programs/:id", (req, res) => {
  // Validate the ID parameter
  const idResult = validateId(req.params.id);
  if (!idResult.ok) {
    res.status(400).json({ error: idResult.error });
    return;
  }

  try {
    const program = new Program();
    const found = program.Load(db, idResult.value);

    if (!found) {
      res.status(404).json({ error: `Program with ID ${idResult.value} was not found.` });
      return;
    }

    res.json(program);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", `Failed to load program ${idResult.value}`, message);
    res.status(500).json({ error: "Could not load the program. Please try again." });
  }
});


/**
 * POST /programs
 * Saves a program — inserts a new record if no ID is provided,
 * or updates an existing record if an ID is given.
 */
app.post("/programs", (req, res) => {
  const { id, name, code } = req.body as {
    id?: number | null;
    name?: string;
    code?: string;
  };

  // Validate each field with descriptive messages on failure
  const idResult   = validateOptionalId(id);
  const nameResult = validateProgramName(name);
  const codeResult = validateProgramCode(code);

  // Collect all validation errors so the user sees everything at once
  const errors: string[] = [];
  if (!idResult.ok)   errors.push(idResult.error);
  if (!nameResult.ok) errors.push(nameResult.error);
  if (!codeResult.ok) errors.push(codeResult.error);

  if (errors.length > 0) {
    res.status(400).json({ error: errors.join(" ") });
    return;
  }

  // Safe to access .value — the early return above guarantees all three passed
  const cleanId   = idResult.ok   ? idResult.value   : null;
  const cleanName = nameResult.ok ? nameResult.value : "";
  const cleanCode = codeResult.ok ? codeResult.value : "";

  try {
    const program = new Program(cleanName, cleanCode, cleanId);
    program.Save(db);

    res.json({
      id:   program.id,
      name: program.name,
      code: program.code,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", "Failed to save program", message);
    res.status(500).json({ error: "Could not save the program. Please try again." });
  }
});


/**
 * DELETE /programs/:id
 * Deletes a program by its ID.
 */
app.delete("/programs/:id", (req, res) => {
  // Validate the ID parameter
  const idResult = validateId(req.params.id);
  if (!idResult.ok) {
    res.status(400).json({ error: idResult.error });
    return;
  }

  try {
    const program = new Program();
    program.Delete(db, idResult.value);
    res.json({ message: `Program ${idResult.value} deleted successfully.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logEvent("error", `Failed to delete program ${idResult.value}`, message);
    res.status(500).json({ error: "Could not delete the program. Please try again." });
  }
});


// ── Global error handler ─────────────────────────────────────────────────────
// Catches unhandled errors in any route so the server never crashes silently.
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logEvent("error", "Unhandled server error", err.stack ?? err.message);
  res.status(500).json({ error: "An unexpected error occurred. Please try again." });
});


// ── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Dirt server running at http://localhost:${PORT}`);
});

// Graceful shutdown — close the database connection on Ctrl+C
process.on("SIGINT", () => {
  logEvent("info", "Server shutting down");
  db.Disconnect();
  process.exit();
});