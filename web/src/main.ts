// main.ts — Dirt Web IDE
//
// Dependencies added (install via npm):
//   highlight.js        → npm i highlight.js
//   toastify-js         → npm i toastify-js
//   @types/toastify-js  → npm i -D @types/toastify-js
//
// In index.html add to <head>:
//   <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark-reasonable.min.css">
//   (or import the theme in style.css / swap to your preferred hljs theme)

import "./style.css";
import Toastify from "toastify-js";
import "toastify-js/src/toastify.css";

import { runProgramDebug }   from "../../dirt/runtime/runProgram";
import type { DirtCallable } from "../../dirt/runtime/runProgram";
import { lex }               from "../../dirt/lexer/lexer";
import { parse }             from "../../dirt/parser/parser";
import { Environment }       from "../../dirt/runtime/environment";
import { registerBuiltins }  from "../../dirt/stdlib/builtins";
import { Interpreter }       from "../../dirt/runtime/interpreter";

// (syntax highlighting uses the hand-rolled Dirt tokeniser below — no external library needed)


// ─── THEME ────────────────────────────────────────────────────────────────────

const root        = document.documentElement;
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle")!;
const iconText    = themeToggle.querySelector<HTMLElement>(".icon-text")!;

function setTheme(mode: "light" | "dark") {
  const dark = mode === "dark";
  if (dark) root.setAttribute("data-theme", "dark");
  else root.removeAttribute("data-theme");
  iconText.textContent = dark ? "Dark" : "Light";
}

const savedTheme = localStorage.getItem("theme") as "dark" | "light" | null;
setTheme(savedTheme ?? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

themeToggle.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  setTheme(next);
  localStorage.setItem("theme", next);
});


// ─── DOM REFS ─────────────────────────────────────────────────────────────────

const editor           = document.querySelector<HTMLTextAreaElement>("#editor")!;
const examples         = document.querySelector<HTMLSelectElement>("#examples")!;
const runBtn           = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn         = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const saveBtn          = document.querySelector<HTMLButtonElement>("#saveBtn")!;
const newBtn           = document.querySelector<HTMLButtonElement>("#newBtn")!;
const deleteBtn        = document.querySelector<HTMLButtonElement>("#deleteBtn")!;
const outBox           = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox           = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox           = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox           = document.querySelector<HTMLPreElement>("#envBox")!;
const errorBar         = document.querySelector<HTMLElement>("#errorBar")!;
const highlightOverlay = document.querySelector<HTMLElement>("#highlightOverlay")!;
const statusCursor     = document.querySelector<HTMLSpanElement>("#statusCursor")!;
const statusChars      = document.querySelector<HTMLSpanElement>("#statusChars")!;
const statusLines      = document.querySelector<HTMLSpanElement>("#statusLines")!;
const unsavedLabel     = document.querySelector<HTMLSpanElement>("#unsavedLabel")!;
// Note: #toastContainer was removed from index.html — Toastify injects its own container
const tabs             = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes            = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));
const gutter           = document.querySelector<HTMLDivElement>(".gutter")!;
const sporeCanvas      = document.querySelector<HTMLCanvasElement>("#sporeBg")!;
const sporeCtx         = sporeCanvas.getContext("2d")!;


// ─── BACKGROUND SCENE ─────────────────────────────────────────────────────────

const SPORE_COUNT = 18, SPORE_MIN_R = 1.5, SPORE_MAX_R = 3.8;
const SPEED_MIN = 0.012, SPEED_MAX = 0.032, DRIFT_MAX = 0.008;
const OPACITY_MIN = 0.12, OPACITY_MAX = 0.42, SWAY_SPEED = 0.0004, HORIZON_H = 0.92;
const STAR_COUNT = 38, CLOUD_COUNT = 6;

const SKY = {
  light: { top: "#b8d8f0", mid: "#daedf8", cloud: "#ffffff", cloudShadow: "#d4e8f5", star: "#4a90c4", starOpMax: 0.18 },
  dark:  { top: "#050c1e", mid: "#0a1628", cloud: "#1e2d45", cloudShadow: "#0d1424", star: "#e8ecf4", starOpMax: 0.85 },
};
const SOIL = {
  light: { a: "#5a7a42", b: "#4a6835", c: "#3a5428" },
  dark:  { a: "#3a5428", b: "#2d4420", c: "#1e3018" },
};

type Spore = { x: number; y: number; r: number; vy: number; sway: number; swayAmp: number; opacity: number; isAmber: boolean; fadeIn: number; fadeOut: number };
type Star  = { x: number; y: number; r: number; phase: number; speed: number };
type Cloud = { x: number; y: number; w: number; h: number; vx: number; opacity: number; puffs: { ox: number; oy: number; r: number }[] };

let spores: Spore[] = [], stars: Star[] = [], clouds: Cloud[] = [], sporeLastTs = 0;

const rand = (min: number, max: number) => min + Math.random() * (max - min);

function spawnSpore(): Spore {
  return { x: rand(0, sporeCanvas.width), y: sporeCanvas.height + rand(0, 60), r: rand(SPORE_MIN_R, SPORE_MAX_R),
           vy: rand(SPEED_MIN, SPEED_MAX), sway: rand(0, Math.PI * 2), swayAmp: rand(0.003, DRIFT_MAX),
           opacity: rand(OPACITY_MIN, OPACITY_MAX), isAmber: Math.random() < 0.18, fadeIn: 0, fadeOut: 1 };
}

function spawnStar(): Star {
  return { x: rand(0, sporeCanvas.width), y: rand(0, sporeCanvas.height * 0.55), r: rand(0.6, 1.8),
           phase: rand(0, Math.PI * 2), speed: rand(0.0005, 0.0015) };
}

function spawnCloud(offscreenRight = false): Cloud {
  const w = rand(120, 280), h = rand(30, 65), puffCount = Math.floor(rand(4, 8));
  const puffs = Array.from({ length: puffCount }, () => ({
    ox: rand(-w * 0.4, w * 0.4), oy: rand(-h * 0.2, h * 0.3), r: rand(h * 0.5, h * 0.9),
  }));
  return { x: offscreenRight ? sporeCanvas.width + w + rand(0, 200) : rand(-w, sporeCanvas.width + w),
           y: rand(sporeCanvas.height * 0.04, sporeCanvas.height * 0.34),
           w, h, vx: rand(0.006, 0.016), opacity: rand(0.55, 0.85), puffs };
}

function initScene() {
  spores = Array.from({ length: SPORE_COUNT }, () => { const s = spawnSpore(); s.y = rand(0, sporeCanvas.height); s.fadeIn = 1; return s; });
  stars  = Array.from({ length: STAR_COUNT  }, spawnStar);
  clouds = Array.from({ length: CLOUD_COUNT }, () => spawnCloud(false));
}

function resizeSpores() { sporeCanvas.width = window.innerWidth; sporeCanvas.height = window.innerHeight; initScene(); }

let sporeResizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener("resize", () => { if (sporeResizeTimer) clearTimeout(sporeResizeTimer); sporeResizeTimer = setTimeout(resizeSpores, 150); });

function drawSpores(ts: number) {
  const dt = Math.min(ts - sporeLastTs, 64);
  sporeLastTs = ts;
  const isDark = root.getAttribute("data-theme") === "dark";
  const sky = isDark ? SKY.dark : SKY.light, soil = isDark ? SOIL.dark : SOIL.light;
  const w = sporeCanvas.width, h = sporeCanvas.height, hy = h * HORIZON_H;

  sporeCtx.clearRect(0, 0, w, h);

  // Sky gradient
  const skyGrad = sporeCtx.createLinearGradient(0, 0, 0, h * 0.62);
  skyGrad.addColorStop(0,    isDark ? "rgba(5,12,30,0.92)"  : "rgba(184,216,240,0.88)");
  skyGrad.addColorStop(0.45, isDark ? "rgba(10,22,40,0.60)" : "rgba(218,237,248,0.55)");
  skyGrad.addColorStop(1,    "rgba(0,0,0,0)");
  sporeCtx.fillStyle = skyGrad;
  sporeCtx.fillRect(0, 0, w, h * 0.62);

  // Stars
  for (const star of stars) {
    star.phase += star.speed * dt;
    const alpha = (0.4 + 0.6 * (0.5 + 0.5 * Math.sin(star.phase))) * sky.starOpMax * Math.max(0, 1 - star.y / (h * 0.50));
    if (alpha < 0.01) continue;
    sporeCtx.save(); sporeCtx.globalAlpha = alpha; sporeCtx.fillStyle = sky.star;
    sporeCtx.beginPath(); sporeCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2); sporeCtx.fill(); sporeCtx.restore();
  }

  // Clouds
  for (const cloud of clouds) {
    cloud.x -= cloud.vx * dt;
    if (cloud.x < -cloud.w - 60) Object.assign(cloud, spawnCloud(true));
    const alpha = cloud.opacity * Math.max(0, 1 - cloud.y / (h * 0.42));
    if (alpha < 0.02) continue;
    sporeCtx.save(); sporeCtx.globalAlpha = alpha;
    for (const puff of cloud.puffs) { sporeCtx.fillStyle = sky.cloudShadow; sporeCtx.beginPath(); sporeCtx.arc(cloud.x + puff.ox, cloud.y + puff.oy + puff.r * 0.18, puff.r * 0.9, 0, Math.PI * 2); sporeCtx.fill(); }
    for (const puff of cloud.puffs) { sporeCtx.fillStyle = sky.cloud;       sporeCtx.beginPath(); sporeCtx.arc(cloud.x + puff.ox, cloud.y + puff.oy,                  puff.r,       0, Math.PI * 2); sporeCtx.fill(); }
    sporeCtx.restore();
  }

  // Soil
  for (const [color, opacity, yOff] of [
    [soil.a, isDark ? 0.28 : 0.20,  22],
    [soil.b, isDark ? 0.20 : 0.14,   0],
    [soil.c, isDark ? 0.12 : 0.08, -20],
  ] as [string, number, number][]) {
    const y0 = hy + yOff;
    sporeCtx.save(); sporeCtx.globalAlpha = opacity; sporeCtx.fillStyle = color;
    sporeCtx.beginPath(); sporeCtx.moveTo(0, h); sporeCtx.lineTo(0, y0 + 10);
    sporeCtx.bezierCurveTo(w*0.08,y0-28, w*0.18,y0+18, w*0.28,y0-10);
    sporeCtx.bezierCurveTo(w*0.38,y0-38, w*0.48,y0+22, w*0.55,y0+4);
    sporeCtx.bezierCurveTo(w*0.62,y0-14, w*0.70,y0-32, w*0.78,y0+8);
    sporeCtx.bezierCurveTo(w*0.85,y0+26, w*0.92,y0-16, w,     y0+12);
    sporeCtx.lineTo(w, h); sporeCtx.closePath(); sporeCtx.fill(); sporeCtx.restore();
  }

  // Spores
  const sporeGreen = isDark ? "#22c55e" : "#16a34a", sporeAmber = isDark ? "#f59e0b" : "#b45309";
  for (let i = 0; i < spores.length; i++) {
    const s = spores[i];
    s.y -= s.vy * dt; s.sway += SWAY_SPEED * dt; s.x += Math.sin(s.sway) * s.swayAmp * dt;
    s.fadeIn = Math.min(1, s.fadeIn + 0.0008 * dt);
    s.fadeOut = s.y < h * 0.15 ? Math.max(0, s.y / (h * 0.15)) : 1;
    if (s.y < -s.r * 2) { spores[i] = spawnSpore(); continue; }
    const alpha = s.opacity * s.fadeIn * s.fadeOut;
    if (alpha < 0.005) continue;
    sporeCtx.save(); sporeCtx.globalAlpha = alpha; sporeCtx.fillStyle = s.isAmber ? sporeAmber : sporeGreen;
    sporeCtx.beginPath(); sporeCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2); sporeCtx.fill(); sporeCtx.restore();
  }

  requestAnimationFrame(drawSpores);
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
  id: Number(row.id), name: String(row.name), code: String(row.code),
  createdAt: row.createdAt ?? row.created_at ?? null, source: "saved",
});

const fetchSavedPrograms     = ()              => api<any[]>("/programs").then(rows => rows.map(mapRow)).catch(() => [] as SavedProgram[]);
const fetchSavedProgramById  = (id: number)    => api<any>(`/programs/${id}`).then(mapRow);
const deleteProgramFromServer= (id: number)    => api<void>(`/programs/${id}`, { method: "DELETE" });
const saveProgramToServer    = (id: number | null, name: string, code: string) =>
  api<any>("/programs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, name, code }) }).then(mapRow);


// ─── TOASTS (via Toastify) ────────────────────────────────────────────────────
// Toastify replaces the entire hand-rolled toast system (~50 lines → 10)

function showToast(message: string, kind: "success" | "error" = "success") {
  Toastify({
    text:       `${kind === "success" ? "✓" : "✕"}  ${message}`,
    duration:   3500,
    gravity:    "top",
    position:   "right",
    stopOnFocus: true,
    style: {
      background:  kind === "success" ? "var(--btn)" : "#dc2626",
      borderRadius:"9px",
      fontSize:    "13px",
      fontWeight:  "600",
    },
  }).showToast();
}


// ─── UNSAVED INDICATOR ────────────────────────────────────────────────────────

function updateUnsavedState() {
  const hasChanges = editor.value !== lastSavedCode;
  saveBtn.classList.toggle("has-unsaved", hasChanges);
  unsavedLabel.classList.toggle("is-hidden", !hasChanges);
}

function markAsSaved(code: string) { lastSavedCode = code; updateUnsavedState(); }


// ─── STATUS BAR ───────────────────────────────────────────────────────────────

function updateStatusBar() {
  const src = editor.value, pos = editor.selectionStart ?? 0;
  const before = src.slice(0, pos).split("\n");
  const ln = before.length, col = before[before.length - 1].length + 1;
  const totalLines = src.split("\n").length;

  statusCursor.textContent = `Ln ${ln}, Col ${col}`;
  statusChars.textContent  = `${src.length} char${src.length !== 1 ? "s" : ""}`;
  statusLines.textContent  = `${totalLines} line${totalLines !== 1 ? "s" : ""}`;

  gutter.querySelectorAll(".line").forEach((el, idx) => el.classList.toggle("active-line", idx + 1 === ln));
}


// ─── GUTTER ───────────────────────────────────────────────────────────────────

function syncGutter() {
  const lineCount = editor.value.split("\n").length;
  const existing  = gutter.querySelectorAll<HTMLDivElement>(".line").length;

  // Add missing lines
  for (let i = existing + 1; i <= lineCount; i++) {
    const div = document.createElement("div");
    div.className = "line"; div.textContent = String(i);
    gutter.appendChild(div);
  }
  // Remove excess lines
  if (existing > lineCount) {
    Array.from(gutter.querySelectorAll<HTMLDivElement>(".line"))
      .slice(lineCount)
      .forEach(el => el.remove());
  }
}


// ─── SYNTAX HIGHLIGHTING (via highlight.js) ───────────────────────────────────
// Replaces 80-line hand-rolled tokeniser with a single hljs call.
// highlight.js doesn't know "Dirt" but JavaScript is close enough for keywords,
// strings, numbers and operators. Register a custom grammar if you need exact parity.

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Dirt keywords — used to distinguish reserved words from plain identifiers.
const DIRT_KEYWORDS = new Set(["let","if","else","while","fn","return","true","false"]);

// Walk the source string character by character and wrap each token in a
// <span> with the appropriate syntax class. This mirrors what the real lexer
// does, but produces HTML instead of Token objects.
function buildHighlightedHtml(src: string): string {
  let out = "";
  let i   = 0;

  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);

  while (i < src.length) {
    const c = src[i];

    // Whitespace — pass through unchanged so layout stays intact
    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      out += escapeHtml(c); i++; continue;
    }

    // Single-line comments — color the entire // … line as a comment
    if (c === "/" && src[i + 1] === "/") {
      const start = i;
      while (i < src.length && src[i] !== "\n") i++;
      out += `<span class="syn-comment">${escapeHtml(src.slice(start, i))}</span>`;
      continue;
    }

    // Number literals — integer or decimal
    if (isDigit(c)) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) { i++; while (i < src.length && isDigit(src[i])) i++; }
      out += `<span class="syn-num">${escapeHtml(src.slice(start, i))}</span>`;
      continue;
    }

    // String literals (double-quoted), including escape sequences
    if (c === '"') {
      const start = i; i++;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") {
        if (src[i] === "\\") i++; // skip escaped character
        i++;
      }
      if (i < src.length && src[i] === '"') i++; // consume closing quote
      out += `<span class="syn-str">${escapeHtml(src.slice(start, i))}</span>`;
      continue;
    }

    // Identifiers, keywords, and function calls
    if (isAlpha(c)) {
      const start = i;
      while (i < src.length && isAlnum(src[i])) i++;
      const word = src.slice(start, i);

      if (DIRT_KEYWORDS.has(word)) {
        // Reserved keyword
        out += `<span class="syn-kw">${escapeHtml(word)}</span>`;
      } else {
        // Peek past whitespace to see if a '(' follows — if so, it's a call
        let j = i;
        while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
        const isCall = src[j] === "(";
        out += `<span class="${isCall ? "syn-fn" : "syn-ident"}">${escapeHtml(word)}</span>`;
      }
      continue;
    }

    // Math and logical operators
    if ("+-*/!".includes(c) || (c === "&" && src[i+1] === "&") || (c === "|" && src[i+1] === "|")
        || (c === "=" && src[i+1] === "=") || (c === "!" && src[i+1] === "=")
        || (c === "<" && src[i+1] === "=") || (c === ">" && src[i+1] === "=")) {
      const two = src.slice(i, i + 2);
      if (["&&","||","==","!=","<=",">="].includes(two)) {
        out += `<span class="syn-op">${escapeHtml(two)}</span>`; i += 2;
      } else {
        out += `<span class="syn-op">${escapeHtml(c)}</span>`; i++;
      }
      continue;
    }

    // Comparison operators (single char)
    if (c === "<" || c === ">" || c === "=") {
      out += `<span class="syn-op">${escapeHtml(c)}</span>`; i++; continue;
    }

    // Punctuation — parens, braces, semicolons, commas
    if ("(){};,".includes(c)) {
      out += `<span class="syn-punc">${escapeHtml(c)}</span>`; i++; continue;
    }

    // Anything else — pass through as plain text
    out += escapeHtml(c); i++;
  }

  return out;
}

function syncHighlight() {
  // Clear first — ensures stale content never shows through between program switches
  highlightOverlay.innerHTML = "";

  // Rebuild the colored overlay from the current editor content
  const html = buildHighlightedHtml(editor.value);

  // Trailing \n keeps overlay height identical to the textarea's content height
  highlightOverlay.innerHTML  = html + "\n";
  highlightOverlay.scrollTop  = editor.scrollTop;
  highlightOverlay.scrollLeft = editor.scrollLeft;
}


// ─── TAB MANAGEMENT ───────────────────────────────────────────────────────────

function setActiveTab(id: string) {
  tabs.forEach(t  => t.classList.toggle("is-active",  t.dataset.tab  === id));
  panes.forEach(p => p.classList.toggle("is-hidden",  p.dataset.pane !== id));
}


// ─── DEBUG HELPERS ────────────────────────────────────────────────────────────

function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
  if (t.lexeme) return `Token(type=${t.type}, lexeme="${t.lexeme}")`;
  return `Token(type=${t.type})`;
}

function astToTree(node: any, indent = ""): string {
  if (!node) return `${indent}<null>`;
  const i2 = indent + "  ";
  switch (node.kind) {
    case "Program":  return [indent + "Program",       ...(node.statements ?? []).map((s: any) => astToTree(s, i2))].join("\n");
    case "Block":    return [indent + "Block",          ...(node.statements ?? []).map((s: any) => astToTree(s, i2))].join("\n");
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
  errorBar.classList.add("is-hidden"); errorBar.textContent = "";
  document.querySelectorAll(".error-line-highlight").forEach(el => el.remove());
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
    if (lm) { const t = tokens.find(t => t.lexeme === lm[1]); if (t?.index !== undefined) return t.index; }
    if (tokens.length >= 2) return tokens[tokens.length - 2].index ?? null;
  } catch { /* swallow */ }
  return null;
}

function showErrorBar(source: string, errorMsg: string) {
  const offset = findErrorOffset(source, errorMsg);
  if (offset !== null) {
    const { line, col } = offsetToLineCol(source, offset);
    errorBar.textContent = `✕  Error on line ${line}, col ${col}: ${errorMsg}`;
    editor.dataset.errorLine = String(line);
    editor.classList.add("has-error-line");
    setTimeout(() => { editor.classList.remove("has-error-line"); delete editor.dataset.errorLine; }, 4000);
  } else {
    errorBar.textContent = `✕  ${errorMsg}`;
  }
  errorBar.classList.remove("is-hidden");
}


// ─── RUN BUTTON STATE ─────────────────────────────────────────────────────────

function setRunning(running: boolean) { runBtn.classList.toggle("is-running", running); runBtn.disabled = running; }


// ─── CANVAS + GAME LOOP ───────────────────────────────────────────────────────

const gameCanvas       = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
const ctx              = gameCanvas.getContext("2d")!;
const WIDTH = gameCanvas.width, HEIGHT = gameCanvas.height;
let currentFillColor   = "#ffffff";

function drawBackground() {
  ctx.fillStyle = "#0b1220"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(255,255,255,0.12)"; ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
}

const dirtGraphics = {
  clear() { drawBackground(); },
  rect(x: number, y: number, w: number, h: number) { ctx.fillStyle = currentFillColor; ctx.fillRect(x, y, w, h); },
  circle(x: number, y: number, radius: number) { ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fillStyle = currentFillColor; ctx.fill(); ctx.closePath(); },
  fillColor(c: string) { currentFillColor = c; },
  width() { return WIDTH; }, height() { return HEIGHT; },
};
drawBackground();

const keysDown = new Set<string>();
window.addEventListener("keydown", e => keysDown.add(e.key));
window.addEventListener("keyup",   e => keysDown.delete(e.key));
const dirtInput = { keyDown: (key: string) => keysDown.has(key) };

let activeUpdateFn: DirtCallable | null = null, activeInterpreter: any = null, activeUpdateEnv: any = null, rafId: number | null = null;

function stopGameLoop() {
  if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  activeUpdateFn = activeInterpreter = activeUpdateEnv = null;
}

function startGameLoop() {
  function frame() {
    if (!activeUpdateFn || !activeInterpreter) return;
    try {
      activeInterpreter.evaluate({ kind: "Call", callee: "__update__", args: [] }, activeUpdateEnv);
    } catch (e) {
      renderOutputPanel([], `Runtime error: ${e instanceof Error ? e.message : String(e)}`);
      stopGameLoop(); setActiveTab("output"); return;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}


// ─── RUN ──────────────────────────────────────────────────────────────────────

function run() {
  stopGameLoop(); hideErrorBar(); currentFillColor = "#ffffff"; setRunning(true);

  setTimeout(() => {
    let capturedUpdateFn: DirtCallable | null = null;
    const result = runProgramDebug(editor.value, {
      sourcePath: "web-ide", graphics: dirtGraphics, input: dirtInput,
      onUpdate(fn: DirtCallable) { capturedUpdateFn = fn; },
    });
    setRunning(false);

    if (!result.ok) {
      const errorMsg = result.error ?? "Unknown error";
      renderOutputPanel(result.output ?? [], errorMsg);
      tokBox.textContent = astBox.textContent = envBox.textContent = "";
      showErrorBar(editor.value, errorMsg);
      setActiveTab("output"); return;
    }

    tokBox.textContent = result.tokens.map(tokenToPrettyLine).join("\n");
    astBox.textContent = astToTree(result.ast);
    envBox.textContent = JSON.stringify(result.env, null, 2);
    renderOutputPanel(result.output, undefined);
    setActiveTab("output");

    if (capturedUpdateFn) {
      const tokens = lex(editor.value), program = parse(tokens), env = new Environment();
      let updateFnValue: any = null;
      registerBuiltins(env, { graphics: dirtGraphics, input: dirtInput, onUpdate: (fn: DirtCallable) => { updateFnValue = fn; } });
      const interp = new Interpreter(env, { graphics: dirtGraphics, input: dirtInput });
      interp.executeProgram(program);
      if (updateFnValue) {
        const callEnv = new Environment(env);
        callEnv.define("__update__", updateFnValue);
        activeInterpreter = interp; activeUpdateEnv = callEnv; activeUpdateFn = updateFnValue;
        setActiveTab("canvas"); startGameLoop();
      }
    }
  }, 0);
}


// ─── PROJECT MANAGEMENT ───────────────────────────────────────────────────────

function setEditorLabel(name: string) { document.querySelector<HTMLElement>(".chip")!.textContent = `Project: ${name}`; }

async function renderProgramDropdown() {
  programList = [...BUILTIN_PROGRAMS, ...await fetchSavedPrograms()];
  examples.innerHTML = "";
  programList.forEach(p => {
    const opt = document.createElement("option");
    opt.value = `${p.source}:${p.id}`; opt.textContent = p.name;
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

  currentProgramId = program.id; currentProgramSource = source;

  // Set the textarea value and reset scroll position before syncing the overlay,
  // so syncHighlight() reads the correct editor.value and scroll state.
  editor.value = program.code;
  editor.scrollTop = editor.scrollLeft = 0;

  examples.value = `${source}:${id}`;
  setEditorLabel(program.name);
  markAsSaved(program.code);

  // Defer the overlay/gutter/status update to the next animation frame.
  // This guarantees the browser has committed editor.value to the DOM
  // before syncHighlight() reads it — preventing the overlay from being
  // painted with stale content from the previously loaded program.
  requestAnimationFrame(() => {
    syncHighlight();
    syncGutter();
    updateStatusBar();
  });
}

async function initializePrograms() { await renderProgramDropdown(); await loadProgramIntoEditor("builtin", 0); }

async function saveCurrentProgram() {
  const current = programList.find(p => p.source === currentProgramSource && p.id === currentProgramId);
  const name = window.prompt("Enter a project name:", current?.name ?? "New Program");
  if (!name?.trim()) return;
  const savedId = currentProgramSource === "saved" ? currentProgramId : null;
  const saved   = await saveProgramToServer(savedId, name.trim(), editor.value);
  currentProgramId = saved.id; currentProgramSource = "saved";
  markAsSaved(saved.code);
  await renderProgramDropdown(); await loadProgramIntoEditor("saved", saved.id);
  showToast(`Saved "${saved.name}"`, "success");
}

function createNewProgram() {
  stopGameLoop(); currentProgramId = currentProgramSource = null;
  editor.value = lastSavedCode = "";
  updateUnsavedState(); setEditorLabel("Untitled"); renderEmpty();
  syncHighlight(); syncGutter(); updateStatusBar(); setActiveTab("output");
}

async function deleteCurrentProgram() {
  if (!currentProgramId || currentProgramSource !== "saved") {
    if (currentProgramSource === "builtin") showToast("Built-in programs cannot be deleted.", "error");
    return;
  }
  const current = programList.find(p => p.source === "saved" && p.id === currentProgramId);
  if (!current || !window.confirm(`Delete "${current.name}"?`)) return;
  await deleteProgramFromServer(current.id); stopGameLoop();
  currentProgramId = 0; currentProgramSource = "builtin";
  await renderProgramDropdown(); await loadProgramIntoEditor("builtin", 0);
  renderEmpty(); showToast(`Deleted "${current.name}"`, "success");
}


// ─── EDITOR EVENT LISTENERS ───────────────────────────────────────────────────

editor.addEventListener("scroll", () => {
  highlightOverlay.scrollTop = editor.scrollTop; highlightOverlay.scrollLeft = editor.scrollLeft;
  gutter.scrollTop = editor.scrollTop;
});

editor.addEventListener("input", () => { syncHighlight(); syncGutter(); updateStatusBar(); updateUnsavedState(); });
["click", "keyup", "selectionchange"].forEach(ev => editor.addEventListener(ev, updateStatusBar));


// ─── BUTTON LISTENERS ─────────────────────────────────────────────────────────

tabs.forEach(btn => btn.addEventListener("click", () => setActiveTab(btn.dataset.tab!)));

examples.addEventListener("change", async () => {
  stopGameLoop();
  const [source, idText] = examples.value.split(":");
  await loadProgramIntoEditor(source as "builtin" | "saved", Number(idText));
});

runBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  stopGameLoop(); renderEmpty(); editor.value = "";
  syncHighlight(); syncGutter(); updateStatusBar(); updateUnsavedState(); setActiveTab("output");
});

saveBtn.addEventListener("click", async () => {
  try { await saveCurrentProgram(); } catch (e) { console.error(e); showToast("Could not save program.", "error"); }
});

newBtn.addEventListener("click", createNewProgram);

deleteBtn.addEventListener("click", async () => {
  try { await deleteCurrentProgram(); } catch (e) { console.error(e); showToast("Could not delete program.", "error"); }
});


// ─── INIT ─────────────────────────────────────────────────────────────────────

(async function init() {
  try {
    await initializePrograms(); // loads default program → sets editor.value, overlay, gutter
  } catch (e) {
    console.error("Programs failed to load:", e);
  }
  // Only clear the output panel and set the active tab — do NOT re-run syncHighlight()
  // here because loadProgramIntoEditor already did it with the correct editor.value.
  // Calling it again after renderEmpty() with a stale value would blank the overlay.
  renderEmpty();
  setActiveTab("output");
})();

// Background scene starts immediately — not gated behind the async program load
resizeSpores();
sporeLastTs = performance.now();
requestAnimationFrame(drawSpores);