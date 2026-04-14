// main.ts — Dirt Web IDE
//
// Entry point for the browser-based IDE. Handles:
//   - Theme toggling (light / dark)
//   - Background sky/stars/soil canvas animation
//   - CodeMirror 6 code editor with syntax highlighting and line numbers
//   - Running Dirt programs and displaying output / tokens / AST / env
//   - Canvas game loop for graphical Dirt programs
//   - Project management (load, save, delete) via the backend API

import "./style.css";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";

// CodeMirror 6 core
import { EditorView, keymap, lineNumbers, drawSelection }   from "@codemirror/view";
import { EditorState, Compartment }                          from "@codemirror/state";
import { defaultKeymap, history, historyKeymap }             from "@codemirror/commands";
import { javascript }                                        from "@codemirror/lang-javascript";
// HighlightStyle lets us define explicit token colors that CM6 injects into its
// own <style> tag — the only reliable way to control syntax colors in CM6.
import { syntaxHighlighting, HighlightStyle }                from "@codemirror/language";
import { tags }                                              from "@lezer/highlight";

import { runProgramDebug }   from "../../dirt/runtime/runProgram";
import type { DirtCallable } from "../../dirt/runtime/runProgram";
import { lex }               from "../../dirt/lexer/lexer";
import { parse }             from "../../dirt/parser/parser";
import { Environment }       from "../../dirt/runtime/environment";
import { registerBuiltins }  from "../../dirt/stdlib/builtins";
import { Interpreter }       from "../../dirt/runtime/interpreter";


// ─── THEME ────────────────────────────────────────────────────────────────────

const root        = document.documentElement;
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle")!;
const iconText    = themeToggle.querySelector<HTMLElement>(".icon-text")!;

function setTheme(mode: "light" | "dark") {
  const dark = mode === "dark";
  if (dark) root.setAttribute("data-theme", "dark");
  else      root.removeAttribute("data-theme");
  iconText.textContent = dark ? "Dark" : "Light";
  // Swap the CM6 highlight style to match the new theme (defined below).
  cmView?.dispatch({ effects: highlightCompartment.reconfigure(syntaxHighlighting(dark ? darkHighlight : lightHighlight)) });
}

const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
setTheme(savedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(next);
  localStorage.setItem("theme", next);
});


// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const editorMount  = document.querySelector<HTMLDivElement>("#editor")!;
const examples     = document.querySelector<HTMLSelectElement>("#examples")!;
const runBtn       = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn     = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const saveBtn      = document.querySelector<HTMLButtonElement>("#saveBtn")!;
const newBtn       = document.querySelector<HTMLButtonElement>("#newBtn")!;
const deleteBtn    = document.querySelector<HTMLButtonElement>("#deleteBtn")!;
const outBox       = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox       = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox       = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox       = document.querySelector<HTMLPreElement>("#envBox")!;
const errorBar     = document.querySelector<HTMLElement>("#errorBar")!;
const statusCursor = document.querySelector<HTMLSpanElement>("#statusCursor")!;
const statusChars  = document.querySelector<HTMLSpanElement>("#statusChars")!;
const statusLines  = document.querySelector<HTMLSpanElement>("#statusLines")!;
const unsavedLabel = document.querySelector<HTMLSpanElement>("#unsavedLabel")!;
const tabs         = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes        = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));
const bgCanvas     = document.querySelector<HTMLCanvasElement>("#sporeBg")!;
const bgCtx        = bgCanvas.getContext("2d")!;


// ─── CODEMIRROR 6 EDITOR ──────────────────────────────────────────────────────

// ── Syntax highlight styles ──────────────────────────────────────────────────
// CM6 injects HighlightStyle rules into its own <style> tag. one for light and one for dark, then
// swap them via a Compartment whenever the user toggles the theme.

const lightHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operator],              color: "#7c3aed" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
                                                     color: "#16a34a", fontWeight: "500" },
  { tag: tags.number,                                color: "#b45309" },
  { tag: [tags.string, tags.special(tags.string)],   color: "#0369a1" },
  { tag: tags.comment,                               color: "#8b92a0", fontStyle: "italic" },
  { tag: tags.variableName,                          color: "#0f1117" },
  { tag: tags.punctuation,                           color: "#8b92a0" },
  { tag: tags.bool,                                  color: "#7c3aed" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: [tags.keyword, tags.operator],              color: "#a78bfa" },
  { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)],
                                                     color: "#22c55e", fontWeight: "500" },
  { tag: tags.number,                                color: "#f59e0b" },
  { tag: [tags.string, tags.special(tags.string)],   color: "#38bdf8" },
  { tag: tags.comment,                               color: "#4f647c", fontStyle: "italic" },
  { tag: tags.variableName,                          color: "#e8ecf4" },
  { tag: tags.punctuation,                           color: "#4f647c" },
  { tag: tags.bool,                                  color: "#a78bfa" },
]);

// A Compartment lets us hot-swap the highlight style at runtime when the theme
// changes, without rebuilding the entire editor state.
const highlightCompartment = new Compartment();

// ── Editor theme (layout/colors, not syntax) ─────────────────────────────────
// EditorView.theme() uses literal values. CSS variables don't resolve inside
// CM6's injected <style> blocks,

const lightTheme = EditorView.theme({
  "&":                  { height: "310px", fontSize: "13.5px", background: "#f4f5f7" },
  ".cm-scroller":       { fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", lineHeight: "22px", overflow: "auto" },
  ".cm-content":        { padding: "10px 14px", caretColor: "#16a34a", color: "#0f1117" },
  ".cm-gutters":        { background: "#eaecf0", borderRight: "1px solid #e2e5eb", color: "#8b92a0" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px", minWidth: "32px", textAlign: "center", fontSize: "12px", fontWeight: "500" },
  ".cm-activeLineGutter":  { color: "#0f1117 !important", fontWeight: "700", background: "transparent" },
  ".cm-activeLine":        { background: "transparent" },
  "&.cm-focused":          { outline: "none" },
  ".cm-selectionBackground, ::selection": { background: "rgba(22,163,74,0.18) !important" },
  ".cm-cursor":            { borderLeftColor: "#16a34a" },
}, { dark: false });

const darkTheme = EditorView.theme({
  "&":                  { height: "310px", fontSize: "13.5px", background: "#090e1a" },
  ".cm-scroller":       { fontFamily: "'JetBrains Mono', ui-monospace, Menlo, monospace", lineHeight: "22px", overflow: "auto" },
  ".cm-content":        { padding: "10px 14px", caretColor: "#16a34a", color: "#e8ecf4" },
  ".cm-gutters":        { background: "#080c18", borderRight: "1px solid #1e2d45", color: "#4f647c" },
  ".cm-lineNumbers .cm-gutterElement": { padding: "0 8px", minWidth: "32px", textAlign: "center", fontSize: "12px", fontWeight: "500" },
  ".cm-activeLineGutter":  { color: "#e8ecf4 !important", fontWeight: "700", background: "transparent" },
  ".cm-activeLine":        { background: "transparent" },
  "&.cm-focused":          { outline: "none" },
  ".cm-selectionBackground, ::selection": { background: "rgba(22,163,74,0.22) !important" },
  ".cm-cursor":            { borderLeftColor: "#22c55e" },
}, { dark: true });

// Another Compartment for the base theme so it can be swapped on toggle too.
const themeCompartment = new Compartment();

// ── Update listener ───────────────────────────────────────────────────────────
// Fires on every document change or cursor movement. replaces the three
// separate textarea event listeners the old code needed.
const updateListener = EditorView.updateListener.of(update => {
  if (update.docChanged || update.selectionSet) {
    updateStatusBar();
    if (update.docChanged) updateUnsavedState();
  }
});

// ── Initial theme detection ───────────────────────────────────────────────────
const isDarkOnLoad = (localStorage.getItem("theme") ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light")) === "dark";

// ── Build editor ──────────────────────────────────────────────────────────────
const cmState = EditorState.create({
  doc: "",
  extensions: [
    lineNumbers(),
    drawSelection(),
    history(),
    javascript(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    themeCompartment.of(isDarkOnLoad ? darkTheme : lightTheme),
    highlightCompartment.of(syntaxHighlighting(isDarkOnLoad ? darkHighlight : lightHighlight)),
    updateListener,
  ],
});

// cmView is declared with `let` because setTheme() references it before the
// EditorView constructor runs. the reference is safe because setTheme is only
// called after cmView is assigned (the initial setTheme call at the top uses
// optional chaining: cmView?.dispatch).
let cmView: EditorView;
cmView = new EditorView({ state: cmState, parent: editorMount });

// Also update the base theme compartment when the theme button is clicked.
// We patch setTheme here after cmView exists.
const _origSetTheme = setTheme;
// Override to also swap the base editor theme, not just the highlight style.
// (The highlight swap is already inside setTheme via cmView?.dispatch above.)
themeToggle.addEventListener("click", () => {
  const dark = root.getAttribute("data-theme") === "dark";
  cmView.dispatch({ effects: themeCompartment.reconfigure(dark ? darkTheme : lightTheme) });
});

// Read the current source text from the CM6 document.
const getCode = () => cmView.state.doc.toString();

// Replace the entire document content in a single CM6 transaction.
function setCode(code: string) {
  cmView.dispatch({
    changes: { from: 0, to: cmView.state.doc.length, insert: code },
  });
}


// ─── BACKGROUND SCENE ─────────────────────────────────────────────────────────

type Star = { x: number; y: number; r: number; phase: number; speed: number };

const SKY = {
  light: { star: "#4a90c4", starOpMax: 0.18 },
  dark:  { star: "#e8ecf4", starOpMax: 0.85 },
};
const SOIL = {
  light: { a: "#5a7a42", b: "#4a6835", c: "#3a5428" },
  dark:  { a: "#3a5428", b: "#2d4420", c: "#1e3018" },
};

const STAR_COUNT = 38;
const HORIZON_H  = 0.92;

let stars: Star[] = [];
let bgLastTs      = 0;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function spawnStar(): Star {
  return {
    x: rand(0, bgCanvas.width), y: rand(0, bgCanvas.height * 0.55),
    r: rand(0.6, 1.8), phase: rand(0, Math.PI * 2), speed: rand(0.0005, 0.0015),
  };
}

function initBg() {
  bgCanvas.width  = window.innerWidth;
  bgCanvas.height = window.innerHeight;
  stars = Array.from({ length: STAR_COUNT }, spawnStar);
}

let bgResizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener("resize", () => {
  if (bgResizeTimer) clearTimeout(bgResizeTimer);
  bgResizeTimer = setTimeout(initBg, 150);
});

function drawBg(ts: number) {
  const dt = Math.min(ts - bgLastTs, 64);
  bgLastTs = ts;

  const isDark = root.getAttribute("data-theme") === "dark";
  const sky    = isDark ? SKY.dark  : SKY.light;
  const soil   = isDark ? SOIL.dark : SOIL.light;
  const w = bgCanvas.width, h = bgCanvas.height, hy = h * HORIZON_H;

  bgCtx.clearRect(0, 0, w, h);

  const skyGrad = bgCtx.createLinearGradient(0, 0, 0, h * 0.62);
  skyGrad.addColorStop(0,    isDark ? "rgba(5,12,30,0.92)"  : "rgba(184,216,240,0.88)");
  skyGrad.addColorStop(0.45, isDark ? "rgba(10,22,40,0.60)" : "rgba(218,237,248,0.55)");
  skyGrad.addColorStop(1,    "rgba(0,0,0,0)");
  bgCtx.fillStyle = skyGrad;
  bgCtx.fillRect(0, 0, w, h * 0.62);

  for (const star of stars) {
    star.phase += star.speed * dt;
    const alpha = (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(star.phase))) * sky.starOpMax
                  * Math.max(0, 1 - star.y / (h * 0.50));
    if (alpha < 0.01) continue;
    bgCtx.save();
    bgCtx.globalAlpha = alpha;
    bgCtx.fillStyle   = sky.star;
    bgCtx.beginPath();
    bgCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    bgCtx.fill();
    bgCtx.restore();
  }

  for (const [color, opacity, yOff] of [
    [soil.a, isDark ? 0.28 : 0.20,  22],
    [soil.b, isDark ? 0.20 : 0.14,   0],
    [soil.c, isDark ? 0.12 : 0.08, -20],
  ] as [string, number, number][]) {
    const y0 = hy + yOff;
    bgCtx.save();
    bgCtx.globalAlpha = opacity;
    bgCtx.fillStyle   = color;
    bgCtx.beginPath();
    bgCtx.moveTo(0, h);
    bgCtx.lineTo(0, y0 + 10);
    bgCtx.bezierCurveTo(w*0.08, y0-28, w*0.18, y0+18, w*0.28, y0-10);
    bgCtx.bezierCurveTo(w*0.38, y0-38, w*0.48, y0+22, w*0.55, y0+4);
    bgCtx.bezierCurveTo(w*0.62, y0-14, w*0.70, y0-32, w*0.78, y0+8);
    bgCtx.bezierCurveTo(w*0.85, y0+26, w*0.92, y0-16, w,      y0+12);
    bgCtx.lineTo(w, h);
    bgCtx.closePath();
    bgCtx.fill();
    bgCtx.restore();
  }

  requestAnimationFrame(drawBg);
}


// ─── PROGRAM TYPES & STATE ────────────────────────────────────────────────────

type BuiltinProgram = { id: number; name: string; code: string; source: "builtin" };
type SavedProgram   = { id: number; name: string; code: string; createdAt?: string | null; source: "saved" };
type ProgramRecord  = BuiltinProgram | SavedProgram;

const BUILTIN_PROGRAMS: BuiltinProgram[] = [
  { id: 0, name: "Hello World", code: 'print("Hello World");', source: "builtin" },
];

let programList: ProgramRecord[]                     = [];
let currentProgramId: number | null                  = null;
let currentProgramSource: "builtin" | "saved" | null = null;
let lastSavedCode = "";


// ─── SERVER API ───────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:3000";

async function api<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, opts);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

const mapRow = (row: any): SavedProgram => ({
  id:        Number(row.id),
  name:      String(row.name),
  code:      String(row.code),
  createdAt: row.createdAt ?? row.created_at ?? null,
  source:    "saved",
});

const fetchSavedPrograms      = ()           => api<any[]>("/programs").then(rows => rows.map(mapRow)).catch(() => [] as SavedProgram[]);
const fetchSavedProgramById   = (id: number) => api<any>(`/programs/${id}`).then(mapRow);
const deleteProgramFromServer = (id: number) => api<void>(`/programs/${id}`, { method: "DELETE" });
const saveProgramToServer     = (id: number | null, name: string, code: string) =>
  api<any>("/programs", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id, name, code }),
  }).then(mapRow);


// ─── TOASTS ───────────────────────────────────────────────────────────────────

function showToast(message: string, kind: "success" | "error" = "success") {
  Toastify({
    text:        `${kind === "success" ? "✓" : "✕"}  ${message}`,
    duration:    3500,
    gravity:     "top",
    position:    "right",
    stopOnFocus: true,
    style: {
      background:   kind === "success" ? "var(--btn)" : "#dc2626",
      borderRadius: "9px",
      fontSize:     "13px",
      fontWeight:   "600",
    },
  }).showToast();
}


// ─── UNSAVED INDICATOR ────────────────────────────────────────────────────────

function updateUnsavedState() {
  const hasChanges = getCode() !== lastSavedCode;
  saveBtn.classList.toggle("has-unsaved", hasChanges);
  unsavedLabel.classList.toggle("is-hidden", !hasChanges);
}

function markAsSaved(code: string) {
  lastSavedCode = code;
  updateUnsavedState();
}


// ─── STATUS BAR ───────────────────────────────────────────────────────────────

function updateStatusBar() {
  const state  = cmView.state;
  const cursor = state.selection.main.head;
  const line   = state.doc.lineAt(cursor);
  const ln     = line.number;
  const col    = cursor - line.from + 1;
  const total  = state.doc.lines;
  const chars  = state.doc.length;

  statusCursor.textContent = `Ln ${ln}, Col ${col}`;
  statusChars.textContent  = `${chars} char${chars !== 1 ? "s" : ""}`;
  statusLines.textContent  = `${total} line${total !== 1 ? "s" : ""}`;
}


// ─── TAB MANAGEMENT ───────────────────────────────────────────────────────────

function setActiveTab(id: string) {
  tabs.forEach(t  => t.classList.toggle("is-active", t.dataset.tab  === id));
  panes.forEach(p => p.classList.toggle("is-hidden", p.dataset.pane !== id));
}


// ─── DEBUG HELPERS ────────────────────────────────────────────────────────────

function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
  if (t.lexeme)                return `Token(type=${t.type}, lexeme="${t.lexeme}")`;
  return `Token(type=${t.type})`;
}

function astToTree(node: any, indent = ""): string {
  if (!node) return `${indent}<null>`;
  const i2 = indent + "  ";
  switch (node.kind) {
    case "Program":  return [indent + "Program",  ...(node.statements ?? []).map((s: any) => astToTree(s, i2))].join("\n");
    case "Block":    return [indent + "Block",    ...(node.statements ?? []).map((s: any) => astToTree(s, i2))].join("\n");
    case "ExprStmt": return `${indent}ExprStmt\n${astToTree(node.expr, i2)}`;
    case "VarDecl":  return `${indent}VarDecl(${node.name})\n${astToTree(node.initializer, i2)}`;
    case "Assign":   return `${indent}Assign(${node.name})\n${astToTree(node.value, i2)}`;
    case "FnDecl":   return `${indent}FnDecl(${node.name})(${node.params?.join(", ")})\n${astToTree(node.body, i2)}`;
    case "Return":   return `${indent}Return${node.value ? "\n" + astToTree(node.value, i2) : ""}`;
    case "If":       return [`${indent}If`, astToTree(node.condition, i2), astToTree(node.then, i2), ...(node.else ? [astToTree(node.else, i2)] : [])].join("\n");
    case "While":    return `${indent}While\n${astToTree(node.condition, i2)}\n${astToTree(node.body, i2)}`;
    case "Number":   return `${indent}Number(${node.value})`;
    case "String":   return `${indent}String("${node.value}")`;
    case "Boolean":  return `${indent}Boolean(${node.value})`;
    case "Unary":    return `${indent}Unary(${node.op})\n${astToTree(node.operand, i2)}`;
    case "Binary":   return `${indent}Binary("${node.op}")\n${astToTree(node.left, i2)}\n${astToTree(node.right, i2)}`;
    case "Call":     return [`${indent}Call("${node.callee}")`, ...(node.args ?? []).map((a: any) => astToTree(a, i2))].join("\n");
    default:         return `${indent}${JSON.stringify(node)}`;
  }
}


// ─── OUTPUT PANEL ─────────────────────────────────────────────────────────────

const nowTs = () => new Date().toLocaleTimeString("en-US", { hour12: false });

function appendOutputRow(container: HTMLPreElement, text: string, kind: "ok" | "error") {
  const isOk = kind === "ok";
  container.insertAdjacentHTML("beforeend",
    `<div class="out-row">
       <span class="out-ts">${nowTs()}</span>
       <span class="${isOk ? "out-prefix-ok" : "out-prefix-err"}">${isOk ? ">" : "✕"}</span>
       <span class="${isOk ? "out-msg-ok"    : "out-msg-err"}">${text}</span>
     </div>`
  );
}

function renderOutputPanel(outputLines: string[], errorMsg?: string) {
  outBox.innerHTML = "";
  if (!outputLines.length && !errorMsg) {
    outBox.innerHTML = `<span class="out-empty">(no output)</span>`;
    return;
  }
  outputLines.forEach(line => appendOutputRow(outBox, line, "ok"));
  if (errorMsg) appendOutputRow(outBox, errorMsg, "error");
}

function renderEmpty() {
  outBox.innerHTML = tokBox.textContent = astBox.textContent = envBox.textContent = "";
  hideErrorBar();
}


// ─── ERROR BAR ────────────────────────────────────────────────────────────────

function hideErrorBar() {
  errorBar.classList.add("is-hidden");
  errorBar.textContent = "";
}

function offsetToLineCol(source: string, offset: number) {
  const lines = source.slice(0, Math.min(offset, source.length)).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function findErrorOffset(source: string, errorMsg: string): number | null {
  const m = errorMsg.match(/at index (\d+)/);
  if (m) return Number(m[1]);
  try {
    const tokens = lex(source);
    const lm = errorMsg.match(/near '([^']+)'/);
    if (lm) {
      const t = tokens.find(t => t.lexeme === lm[1]);
      if (t?.index !== undefined) return t.index;
    }
    if (tokens.length >= 2) return tokens[tokens.length - 2].index ?? null;
  } catch { }
  return null;
}

function showErrorBar(source: string, errorMsg: string) {
  const offset = findErrorOffset(source, errorMsg);
  if (offset !== null) {
    const { line, col } = offsetToLineCol(source, offset);
    errorBar.textContent = `✕  Error on line ${line}, col ${col}: ${errorMsg}`;
  } else {
    errorBar.textContent = `✕  ${errorMsg}`;
  }
  errorBar.classList.remove("is-hidden");
}


// ─── RUN BUTTON STATE ─────────────────────────────────────────────────────────

function setRunning(running: boolean) {
  runBtn.classList.toggle("is-running", running);
  runBtn.disabled = running;
}


// ─── CANVAS + GAME LOOP ───────────────────────────────────────────────────────

const gameCanvas = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
const ctx        = gameCanvas.getContext("2d")!;
const WIDTH = gameCanvas.width, HEIGHT = gameCanvas.height;
let currentFillColor = "#ffffff";

function drawBackground() {
  ctx.fillStyle   = "#0b1220";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
}

const dirtGraphics = {
  clear()                                          { drawBackground(); },
  rect(x: number, y: number, w: number, h: number){ ctx.fillStyle = currentFillColor; ctx.fillRect(x, y, w, h); },
  circle(x: number, y: number, radius: number)    { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = currentFillColor; ctx.fill(); ctx.closePath(); },
  fillColor(c: string)                             { currentFillColor = c; },
  width()  { return WIDTH;  },
  height() { return HEIGHT; },
};
drawBackground();

const keysDown = new Set<string>();
window.addEventListener("keydown", e => keysDown.add(e.key));
window.addEventListener("keyup",   e => keysDown.delete(e.key));
const dirtInput = { keyDown: (key: string) => keysDown.has(key) };

let activeUpdateFn:    DirtCallable | null = null;
let activeInterpreter: any                 = null;
let activeUpdateEnv:   any                 = null;
let rafId:             number | null       = null;

function stopGameLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  activeUpdateFn = activeInterpreter = activeUpdateEnv = null;
}

function startGameLoop() {
  function frame() {
    if (!activeUpdateFn || !activeInterpreter) return;
    try {
      activeInterpreter.evaluate(
        { kind: "Call", callee: "__update__", args: [] },
        activeUpdateEnv,
      );
    } catch (e) {
      renderOutputPanel([], `Runtime error: ${e instanceof Error ? e.message : String(e)}`);
      stopGameLoop();
      setActiveTab("output");
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}


// ─── RUN ──────────────────────────────────────────────────────────────────────

function run() {
  stopGameLoop();
  hideErrorBar();
  currentFillColor = "#ffffff";
  setRunning(true);

  setTimeout(() => {
    const source = getCode();
    let capturedUpdateFn: DirtCallable | null = null;

    const result = runProgramDebug(source, {
      sourcePath: "web-ide",
      graphics:   dirtGraphics,
      input:      dirtInput,
      onUpdate(fn: DirtCallable) { capturedUpdateFn = fn; },
    });

    setRunning(false);

    if (!result.ok) {
      const errorMsg = result.error ?? "Unknown error";
      renderOutputPanel(result.output ?? [], errorMsg);
      tokBox.textContent = astBox.textContent = envBox.textContent = "";
      showErrorBar(source, errorMsg);
      setActiveTab("output");
      return;
    }

    tokBox.textContent = result.tokens.map(tokenToPrettyLine).join("\n");
    astBox.textContent = astToTree(result.ast);
    envBox.textContent = JSON.stringify(result.env, null, 2);
    renderOutputPanel(result.output, undefined);
    setActiveTab("output");

    if (capturedUpdateFn) {
      const tokens = lex(source);
      const program = parse(tokens);
      const env = new Environment();
      let updateFnValue: any = null;

      registerBuiltins(env, {
        graphics: dirtGraphics,
        input:    dirtInput,
        onUpdate: (fn: DirtCallable) => { updateFnValue = fn; },
      });

      const interp = new Interpreter(env, { graphics: dirtGraphics, input: dirtInput });
      interp.executeProgram(program);

      if (updateFnValue) {
        const callEnv = new Environment(env);
        callEnv.define("__update__", updateFnValue);
        activeInterpreter = interp;
        activeUpdateEnv   = callEnv;
        activeUpdateFn    = updateFnValue;
        setActiveTab("canvas");
        startGameLoop();
      }
    }
  }, 0);
}


// ─── PROJECT MANAGEMENT ───────────────────────────────────────────────────────

function setEditorLabel(name: string) {
  document.title = `${name} — Dirt Web IDE`;
}

async function renderProgramDropdown() {
  programList = [...BUILTIN_PROGRAMS, ...await fetchSavedPrograms()];
  examples.innerHTML = "";
  programList.forEach(p => {
    const opt = document.createElement("option");
    opt.value       = `${p.source}:${p.id}`;
    opt.textContent = p.name;
    examples.appendChild(opt);
  });
  if (currentProgramId !== null && currentProgramSource !== null) {
    const v = `${currentProgramSource}:${currentProgramId}`;
    if (Array.from(examples.options).some(o => o.value === v)) examples.value = v;
  }
}

async function loadProgramIntoEditor(source: "builtin" | "saved", id: number) {
  const program = source === "builtin"
    ? BUILTIN_PROGRAMS.find(p => p.id === id)!
    : await fetchSavedProgramById(id);

  currentProgramId     = program.id;
  currentProgramSource = source;

  setCode(program.code);
  cmView.dispatch({ effects: EditorView.scrollIntoView(0) });

  examples.value = `${source}:${id}`;
  setEditorLabel(program.name);
  markAsSaved(program.code);
}

async function initializePrograms() {
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
}

async function saveCurrentProgram() {
  const current = programList.find(p => p.source === currentProgramSource && p.id === currentProgramId);
  const name = window.prompt("Enter a project name:", current?.name ?? "New Program");
  if (!name?.trim()) return;

  const savedId = currentProgramSource === "saved" ? currentProgramId : null;
  const saved   = await saveProgramToServer(savedId, name.trim(), getCode());

  currentProgramId     = saved.id;
  currentProgramSource = "saved";
  markAsSaved(saved.code);
  await renderProgramDropdown();
  await loadProgramIntoEditor("saved", saved.id);
  showToast(`Saved "${saved.name}"`, "success");
}

function createNewProgram() {
  stopGameLoop();
  currentProgramId     = null;
  currentProgramSource = null;
  lastSavedCode        = "";
  document.title       = "Untitled — Dirt Web IDE";
  setCode("");
  renderEmpty();
  setActiveTab("output");
}

async function deleteCurrentProgram() {
  if (!currentProgramId || currentProgramSource !== "saved") {
    if (currentProgramSource === "builtin") showToast("Built-in programs cannot be deleted.", "error");
    return;
  }
  const current = programList.find(p => p.source === "saved" && p.id === currentProgramId);
  if (!current || !window.confirm(`Delete "${current.name}"?`)) return;

  await deleteProgramFromServer(current.id);
  stopGameLoop();

  currentProgramId     = 0;
  currentProgramSource = "builtin";
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
  renderEmpty();
  showToast(`Deleted "${current.name}"`, "success");
}


// ─── BUTTON + TAB LISTENERS ───────────────────────────────────────────────────

tabs.forEach(btn => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab!)));

examples.addEventListener("change", async () => {
  stopGameLoop();
  const [source, idText] = examples.value.split(":");
  await loadProgramIntoEditor(source as "builtin" | "saved", Number(idText));
});

runBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  stopGameLoop();
  renderEmpty();
  setCode("");
  setActiveTab("output");
});

saveBtn.addEventListener("click", async () => {
  try { await saveCurrentProgram(); }
  catch (e) { console.error(e); showToast("Could not save program.", "error"); }
});

newBtn.addEventListener("click", createNewProgram);

deleteBtn.addEventListener("click", async () => {
  try { await deleteCurrentProgram(); }
  catch (e) { console.error(e); showToast("Could not delete program.", "error"); }
});


(async function init() {
  try { await initializePrograms(); }
  catch (e) { console.error("Programs failed to load:", e); }
  renderEmpty();
  setActiveTab("output");
})();

initBg();
bgLastTs = performance.now();
requestAnimationFrame(drawBg);