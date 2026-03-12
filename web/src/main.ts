import "./style.css";
import { runProgramDebug } from "../../dirt/runtime/runProgram";

/* ======================================================
   THEME TOGGLE (Light / Dark)
====================================================== */

const root = document.documentElement;
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle");

if (themeToggle) {
  const icon = themeToggle.querySelector<HTMLElement>(".icon");
  const iconText = themeToggle.querySelector<HTMLElement>(".icon-text");

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

  function initTheme() {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (!saved) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
      return;
    }
    setTheme(saved);
  }

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
====================================================== */

const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
const examples = document.querySelector<HTMLSelectElement>("#examples")!;

const runBtn = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const saveBtn = document.querySelector<HTMLButtonElement>("#saveBtn")!;
const newBtn = document.querySelector<HTMLButtonElement>("#newBtn")!;
const deleteBtn = document.querySelector<HTMLButtonElement>("#deleteBtn")!;

const outBox = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox = document.querySelector<HTMLPreElement>("#envBox")!;

const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));

/* ======================================================
   PROGRAM TYPES
====================================================== */

type BuiltinProgram = {
  id: number;
  name: string;
  code: string;
  source: "builtin";
};

type SavedProgram = {
  id: number;
  name: string;
  code: string;
  createdAt?: string | null;
  source: "saved";
};

type ProgramRecord = BuiltinProgram | SavedProgram;

const BUILTIN_PROGRAMS: BuiltinProgram[] = [
  {
    id: 0,
    name: "Hello World",
    code: "print(1 + 2 * 3);",
    source: "builtin",
  }
];

let programList: ProgramRecord[] = [];
let currentProgramId: number | null = null;
let currentProgramSource: "builtin" | "saved" | null = null;

/* ======================================================
   SERVER API
====================================================== */

const API_BASE = "http://localhost:3000";

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

  if (currentProgramId !== null && currentProgramSource !== null) {
    const value = `${currentProgramSource}:${currentProgramId}`;
    const exists = Array.from(examples.options).some(opt => opt.value === value);
    if (exists) {
      examples.value = value;
    }
  }
}

function setEditorLabel(name: string) {
  const chip = document.querySelector<HTMLElement>(".chip");
  if (chip) chip.textContent = `Project: ${name}`;
}

function getBuiltInProgramById(id: number): BuiltinProgram | undefined {
  return BUILTIN_PROGRAMS.find(p => p.id === id);
}

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

async function initializePrograms() {
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
}

/* ======================================================
   TAB MANAGEMENT
====================================================== */

function setActiveTab(id: string) {
  tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === id));
  panes.forEach(p => p.classList.toggle("is-hidden", p.dataset.pane !== id));
}

/* ======================================================
   DEBUG VISUALIZATION HELPERS
====================================================== */

function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) {
    return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
  }
  if (t.lexeme) return `Token(type=${t.type}, lexeme="${t.lexeme}")`;
  return `Token(type=${t.type})`;
}

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

function renderEmpty() {
  outBox.textContent = "";
  tokBox.textContent = "";
  astBox.textContent = "";
  envBox.textContent = "";
}

function run() {
  const source = editor.value;
  const result = runProgramDebug(source, { sourcePath: "web-ide" });

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