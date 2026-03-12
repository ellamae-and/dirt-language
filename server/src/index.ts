import express from "express";
import cors from "cors";
import { Database } from "./database.js";
import { Program } from "./program.js";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

const db = new Database();
db.Connect();

// create table once at startup
db.Execute(`
  CREATE TABLE IF NOT EXISTS programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

/**
 * Get all programs for the dropdown list
 */
app.get("/programs", (_req, res) => {
  const programs = Program.ListAll(db);
  res.json(programs);
});

/**
 * Get one program by id
 */
app.get("/programs/:id", (req, res) => {
  const id = Number(req.params.id);

  const program = new Program();
  const found = program.Load(db, id);

  if (!found) {
    res.status(404).json({ error: "Program not found" });
    return;
  }

  res.json(program);
});

/**
 * Save program
 * - inserts new if no id
 * - updates existing if id is provided
 */
app.post("/programs", (req, res) => {
  const { id, name, code } = req.body as {
    id?: number | null;
    name?: string;
    code?: string;
  };

  if (!name || !code) {
    res.status(400).json({ error: "name and code are required" });
    return;
  }

  const program = new Program(name, code, id ?? null);
  program.Save(db);

  res.json({
    id: program.id,
    name: program.name,
    code: program.code
  });
});

/**
 * Delete by id
 */
app.delete("/programs/:id", (req, res) => {
  const id = Number(req.params.id);

  const program = new Program();
  program.Delete(db, id);

  res.json({ message: "Program deleted" });
});

app.listen(PORT, () => {
  console.log(`Dirt server running at http://localhost:${PORT}`);
});

process.on("SIGINT", () => {
  db.Disconnect();
  process.exit();
});