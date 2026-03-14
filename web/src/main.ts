import "./style.css";

// Import the Dirt runtime debugger.
// This function executes Dirt code and returns debugging information
// including tokens, AST, environment state, and program output.
import { runProgramDebug } from "../../dirt/runtime/runProgram";

/* ======================================================
   THEME TOGGLE (Light / Dark)
   Handles switching between light and dark themes
   and persists the preference in localStorage.
====================================================== */

// Reference to the root HTML element (<html>)
const root = document.documentElement;

// Button used to toggle the theme
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle");

if (themeToggle) {

    // Optional icon elements inside the toggle button
  const icon = themeToggle.querySelector<HTMLElement>(".icon");
  const iconText = themeToggle.querySelector<HTMLElement>(".icon-text");

    /**
   * Applies the selected theme to the document
   */
  function setTheme(mode: "light" | "dark") {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
      if (icon) icon.textContent = "";
      if (iconText) iconText.textContent = "Dark";
    } else {
      root.removeAttribute("data-theme");
      if (icon) icon.textContent = "";
      if (iconText) iconText.textContent = "Light";
    }
  }

    /**
   * Initializes theme when the IDE loads.
   * Uses saved preference if available,
   * otherwise falls back to system preference.
   */
  function initTheme() {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (!saved) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
      return;
    }
    setTheme(saved);
  }

    /**
   * Toggle between themes when the button is clicked
   */

  themeToggle.addEventListener("click", () => {
    const isDark = root.getAttribute("data-theme") === "dark";
    const next: "light" | "dark" = isDark ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
  });

  initTheme();
}


/* ======================================================
   IDE ELEMENTS
   References to UI components used in the web IDE
====================================================== */


// Code editor where users write Dirt programs
const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;

// Dropdown menu containing built-in and saved programs
const examples = document.querySelector<HTMLSelectElement>("#examples")!;

// Main action buttons
const runBtn = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#saveBtn")!;
const newBtn = document.querySelector<HTMLButtonElement>("#newBtn")!;
const deleteBtn = document.querySelector<HTMLButtonElement>("#deleteBtn")!;

// Debugging output panels
const outBox = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox = document.querySelector<HTMLPreElement>("#envBox")!;

// Tab buttons and corresponding panel elements
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));

/* ======================================================
   PROGRAM TYPES
   Defines the data structures used for programs
====================================================== */

/**
 * Built-in example programs included with the IDE.
 */
type BuiltinProgram = {
  id: number;
  name: string;
  code: string;
  source: "builtin";
};

/**
 * Programs saved by the user in the database.
 */
type SavedProgram = {
  id: number;
  name: string;
  code: string;
  createdAt?: string | null;
  source: "saved";
};

/**
 * A program record can be either built-in or saved.
 */
type ProgramRecord = BuiltinProgram | SavedProgram;

/**
 * Default programs shipped with the IDE.
 */
const BUILTIN_PROGRAMS: BuiltinProgram[] = [
  {
    id: 0,
    name: "Hello World",
    code: "print(1 + 2 * 3);",
    source: "builtin",
  }
];

// Current program state
let programList: ProgramRecord[] = [];
let currentProgramId: number | null = null;
let currentProgramSource: "builtin" | "saved" | null = null;

/* ======================================================
   SERVER API
   Handles communication with the backend database API
====================================================== */

// Base URL of the local server
const API_BASE = "http://localhost:3000";


/**
 * Fetch all saved programs from the server.
 */
async function fetchSavedPrograms(): Promise<SavedProgram[]> {
  const response = await fetch(`${API_BASE}/programs`);
  if (!response.ok) {
    throw new Error("Failed to fetch programs.");
  }

  const rows = await response.json();
  return rows.map((row: any) => ({
    id: Number(row.id),
    name: String(row.name),
    code: String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source: "saved" as const,
  }));
}

async function fetchSavedProgramById(id: number): Promise<SavedProgram> {
  const response = await fetch(`${API_BASE}/programs/${id}`);
  if (!response.ok) {
    throw new Error("Failed to load program.");
  }

    // Normalize server response format
  const row = await response.json();
  return {
    id: Number(row.id),
    name: String(row.name),
    code: String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source: "saved",
  };
}

async function saveProgramToServer(id: number | null, name: string, code: string): Promise<SavedProgram> {
  const response = await fetch(`${API_BASE}/programs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ id, name, code }),
  });

  if (!response.ok) {
    throw new Error("Failed to save program.");
  }

  const row = await response.json();
  return {
    id: Number(row.id),
    name: String(row.name),
    code: String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source: "saved",
  };
}

async function deleteProgramFromServer(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/programs/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error("Failed to delete program.");
  }
}

/* ======================================================
   PROGRAM LIST / DROPDOWN
====================================================== */

/**
 * Loads built-in and saved programs
 * and populates the dropdown menu.
 */

async function renderProgramDropdown() {
  const savedPrograms = await fetchSavedPrograms();
  programList = [...BUILTIN_PROGRAMS, ...savedPrograms];

  examples.innerHTML = "";

  for (const program of programList) {
    const option = document.createElement("option");
    option.value = `${program.source}:${program.id}`;
    option.textContent = program.name;
    examples.appendChild(option);
  }


    // Restore previously selected program if possible
  if (currentProgramId !== null && currentProgramSource !== null) {
    const value = `${currentProgramSource}:${currentProgramId}`;
    const exists = Array.from(examples.options).some(opt => opt.value === value);
    if (exists) {
      examples.value = value;
    }
  }
}



/**
 * Updates the project label shown above the editor.
 */
function setEditorLabel(name: string) {
  const chip = document.querySelector<HTMLElement>(".chip");
  if (chip) chip.textContent = `Project: ${name}`;
}


/**
 * Retrieves a built-in program by ID.
 */
function getBuiltInProgramById(id: number): BuiltinProgram | undefined {
  return BUILTIN_PROGRAMS.find(p => p.id === id);
}


/**
 * Loads a program into the editor.
 */
async function loadProgramIntoEditor(source: "builtin" | "saved", id: number) {
  if (source === "builtin") {
    const program = getBuiltInProgramById(id);
    if (!program) return;

    currentProgramId = program.id;
    currentProgramSource = "builtin";
    editor.value = program.code;
    setEditorLabel(program.name);
    examples.value = `builtin:${program.id}`;
    return;
  }

  const program = await fetchSavedProgramById(id);
  currentProgramId = program.id;
  currentProgramSource = "saved";
  editor.value = program.code;
  setEditorLabel(program.name);
  examples.value = `saved:${program.id}`;
}


/**
 * Initializes programs when the IDE loads.
 */
async function initializePrograms() {
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
}

/* ======================================================
   TAB MANAGEMENT
   Controls which debug panel is visible
====================================================== */

/**
 * Activates the selected tab and hides others.
 */
function setActiveTab(id: string) {
  tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === id));
  panes.forEach(p => p.classList.toggle("is-hidden", p.dataset.pane !== id));
}

/* ======================================================
   DEBUG VISUALIZATION HELPERS
   Converts tokens and AST structures into readable text
====================================================== */

/**
 * Converts a token object into a readable string.
 */
function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) {
    return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
  }
  if (t.lexeme) return `Token(type=${t.type}, lexeme="${t.lexeme}")`;
  return `Token(type=${t.type})`;
}


/**
 * Recursively prints the AST structure in a tree format.
 */
function astToTree(node: any, indent = ""): string {
  if (!node) return `${indent}<null>`;

  if (node.kind === "Program") {
    const lines = [`${indent}Program`];
    for (const s of node.statements ?? []) lines.push(astToTree(s, indent + "  "));
    return lines.join("\n");
  }

  if (node.kind === "ExprStmt") {
    return `${indent}ExprStmt\n${astToTree(node.expr, indent + "  ")}`;
  }

  if (node.kind === "Number") return `${indent}Number(${node.value})`;

  if (node.kind === "Binary") {
    return [
      `${indent}Binary("${node.op}")`,
      astToTree(node.left, indent + "  "),
      astToTree(node.right, indent + "  "),
    ].join("\n");
  }

  if (node.kind === "Call") {
    const lines = [`${indent}Call("${node.callee}")`];
    for (const a of node.args ?? []) lines.push(astToTree(a, indent + "  "));
    return lines.join("\n");
  }

  return `${indent}${JSON.stringify(node)}`;
}

/* ======================================================
   OUTPUT MANAGEMENT
====================================================== */

/**
 * Clears all output/debug panels.
 */
function renderEmpty() {
  outBox.textContent = "";
  tokBox.textContent = "";
  astBox.textContent = "";
  envBox.textContent = "";
}


/**
 * Executes the Dirt program currently in the editor.
 * Displays output, tokens, AST, and environment state.
 */
function run() {
  const source = editor.value;
  const result = runProgramDebug(editor.value, {
    sourcePath: "web-ide",
    graphics: dirtGraphics,
  });

  if (!result.ok) {
    outBox.textContent =
      (result.output?.length ? result.output.map(x => `> ${x}`).join("\n") + "\n" : "") +
      `Error: ${result.error}`;
    tokBox.textContent = "";
    astBox.textContent = "";
    envBox.textContent = "";
    setActiveTab("output");
    return;
  }

  outBox.textContent = result.output.length
    ? result.output.map(x => `> ${x}`).join("\n")
    : "> (no output)";

  tokBox.textContent = result.tokens.map(tokenToPrettyLine).join("\n");
  astBox.textContent = astToTree(result.ast);
  envBox.textContent = JSON.stringify(result.env, null, 2);

  setActiveTab("output");
}

/* ======================================================
   PROJECT ACTIONS
====================================================== */

async function saveCurrentProgram() {
  const current =
    currentProgramSource === "saved"
      ? programList.find(p => p.source === "saved" && p.id === currentProgramId)
      : programList.find(p => p.source === "builtin" && p.id === currentProgramId);

  const suggestedName = current ? current.name : "New Program";

  const name = window.prompt("Enter a project name:", suggestedName);
  if (!name) return;

  const trimmedName = name.trim();
  if (!trimmedName) return;

  const savedId = currentProgramSource === "saved" ? currentProgramId : null;

  const savedProgram = await saveProgramToServer(savedId, trimmedName, editor.value);

  currentProgramId = savedProgram.id;
  currentProgramSource = "saved";

  await renderProgramDropdown();
  await loadProgramIntoEditor("saved", savedProgram.id);
}

function createNewProgram() {
  currentProgramId = null;
  currentProgramSource = null;
  editor.value = "";
  setEditorLabel("Untitled");
  renderEmpty();
  setActiveTab("output");
}

async function deleteCurrentProgram() {
  if (currentProgramId === null || currentProgramSource === null) return;

  if (currentProgramSource === "builtin") {
    window.alert("Built-in example programs cannot be deleted.");
    return;
  }

  const current = programList.find(
    p => p.source === "saved" && p.id === currentProgramId
  );

  if (!current) return;

  const confirmed = window.confirm(`Delete "${current.name}"?`);
  if (!confirmed) return;

  await deleteProgramFromServer(current.id);

  currentProgramId = 0;
  currentProgramSource = "builtin";

  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
  renderEmpty();
}

/* ======================================================
   EVENT LISTENERS
====================================================== */

tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.tab!;
    setActiveTab(id);
  });
});

examples.addEventListener("change", async () => {
  const [source, idText] = examples.value.split(":");
  const id = Number(idText);

  if (source === "builtin") {
    await loadProgramIntoEditor("builtin", id);
  } else {
    await loadProgramIntoEditor("saved", id);
  }
});

runBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  renderEmpty();
  editor.value = "";
  setActiveTab("output");
});

saveBtn.addEventListener("click", async () => {
  try {
    await saveCurrentProgram();
  } catch (error) {
    console.error(error);
    window.alert("Could not save program.");
  }
});

newBtn.addEventListener("click", createNewProgram);

deleteBtn.addEventListener("click", async () => {
  try {
    await deleteCurrentProgram();
  } catch (error) {
    console.error(error);
    window.alert("Could not delete program.");
  }
});

/* ======================================================
   INITIALIZATION
====================================================== */

(async function init() {
  try {
    await initializePrograms();
  } catch (error) {
    console.error(error);
    window.alert("Could not load programs from the database.");
  }

  renderEmpty();
  setActiveTab("output");
})();

/* ======================================================
   DIRT GRAPHICS BRIDGE
====================================================== */

const gameCanvas = document.querySelector<HTMLCanvasElement>("#gameCanvas");

type DirtGraphicsBridge = {
  clear: () => void;
  rect: (x: number, y: number, width: number, height: number) => void;
  circle: (x: number, y: number, radius: number) => void;
};

let dirtGraphics: DirtGraphicsBridge | undefined;

if (gameCanvas) {
  const ctx = gameCanvas.getContext("2d")!;

  if (ctx) {
    const WIDTH = gameCanvas.width;
    const HEIGHT = gameCanvas.height;

    function drawBackground() {
      ctx.fillStyle = "#0b1220";
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      ctx.strokeStyle = "rgba(255,255,255,0.12)";
      ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
    }

    dirtGraphics = {
      clear() {
        drawBackground();
      },

      rect(x: number, y: number, width: number, height: number) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(x, y, width, height);
      },

      circle(x: number, y: number, radius: number) {
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.closePath();
      },
    };

    drawBackground();
  }
}