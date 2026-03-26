// main.ts  (web IDE)
import "./style.css";

import { runProgramDebug }  from "../../dirt/runtime/runProgram";
import type { DirtCallable } from "../../dirt/runtime/runProgram";
import { lex }               from "../../dirt/lexer/lexer";
import { parse }             from "../../dirt/parser/parser";
import { Environment }       from "../../dirt/runtime/environment";
import { registerBuiltins }  from "../../dirt/stdlib/builtins";
import { Interpreter }       from "../../dirt/runtime/interpreter";


// ── Theme toggle ──────────────────────────────────────────────────────────────

const root        = document.documentElement;
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle");

if (themeToggle) {
  const iconText = themeToggle.querySelector<HTMLElement>(".icon-text");

  function setTheme(mode: "light" | "dark") {
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
      if (iconText) iconText.textContent = "Dark";
    } else {
      root.removeAttribute("data-theme");
      if (iconText) iconText.textContent = "Light";
    }
  }

  function initTheme() {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (!saved) {
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
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


// ── DOM references ────────────────────────────────────────────────────────────

const editor    = document.querySelector<HTMLTextAreaElement>("#editor")!;
const examples  = document.querySelector<HTMLSelectElement>("#examples")!;
const runBtn    = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn  = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const saveBtn   = document.querySelector<HTMLButtonElement>("#saveBtn")!;
const newBtn    = document.querySelector<HTMLButtonElement>("#newBtn")!;
const deleteBtn = document.querySelector<HTMLButtonElement>("#deleteBtn")!;

const outBox = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox = document.querySelector<HTMLPreElement>("#envBox")!;

const errorBar         = document.querySelector<HTMLElement>("#errorBar")!;
const highlightOverlay = document.querySelector<HTMLElement>("#highlightOverlay")!;

// Status bar spans
const statusCursor = document.querySelector<HTMLSpanElement>("#statusCursor")!;
const statusChars  = document.querySelector<HTMLSpanElement>("#statusChars")!;
const statusLines  = document.querySelector<HTMLSpanElement>("#statusLines")!;

// Unsaved label in the action row (right side)
const unsavedLabel = document.querySelector<HTMLSpanElement>("#unsavedLabel")!;

// Toast container — toasts are appended here by showToast()
const toastContainer = document.querySelector<HTMLDivElement>("#toastContainer")!;

const tabs  = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));


// ── BACKGROUND SCENE ENGINE ──────────────────────────────────────────────────
//
// Draws a full-viewport fixed canvas behind the page with four layered elements:
//
//   1. SKY WASH       — a soft blue-to-white vertical fade at the top
//   2. SUN            — a soft glowing circle in the upper portion
//   3. STARS          — sparse tiny dots scattered across the sky zone,
//                       each twinkling on its own slow timer
//   4. CLOUDS         — 4–5 soft white/grey rounded shapes drifting slowly
//                       left to right across the upper half
//   5. SOIL HORIZON   — multi-curve rolling ground at the bottom
//   6. SPORE DRIFT    — tiny green/amber particles floating upward
//
// The sky elements fade in across the top ~55% of the viewport and are
// completely gone by the horizon, so the IDE (which sits in the middle)
// floats naturally between sky and earth.

const sporeCanvas = document.querySelector<HTMLCanvasElement>("#sporeBg")!;
const sporeCtx    = sporeCanvas.getContext("2d")!;

// ── Tunables ──────────────────────────────────────────────────────────────────

const SPORE_COUNT   = 18;
const SPORE_MIN_R   = 1.5;
const SPORE_MAX_R   = 3.8;
const SPEED_MIN     = 0.012;
const SPEED_MAX     = 0.032;
const DRIFT_MAX     = 0.008;
const OPACITY_MIN   = 0.12;
const OPACITY_MAX   = 0.42;
const SWAY_SPEED    = 0.0004;
const HORIZON_H     = 0.92;   // fraction of viewport where soil starts

const STAR_COUNT    = 38;     // sparse stars scattered in sky zone
const CLOUD_COUNT   = 6;

// Sky colours — hardcoded because this is a physical scene, not a UI theme
// Dark mode gets a deep night sky instead
const SKY = {
  light: {
    top:         "#b8d8f0",  // soft blue at the very top
    mid:         "#daedf8",  // lighter blue-white in the middle
    cloud:       "#ffffff",
    cloudShadow: "#d4e8f5",
    star:        "#4a90c4",  // faint blue — barely visible in daylight
    starOpMax:   0.18,
  },
  dark: {
    top:         "#050c1e",  // deep midnight
    mid:         "#0a1628",
    cloud:       "#1e2d45",
    cloudShadow: "#0d1424",
    star:        "#e8ecf4",
    starOpMax:   0.85,       // vivid at night
  },
};

const SOIL = {
  light: { a: "#5a7a42", b: "#4a6835", c: "#3a5428" },
  dark:  { a: "#3a5428", b: "#2d4420", c: "#1e3018" },
};

// ── Types ─────────────────────────────────────────────────────────────────────

type Spore = {
  x: number; y: number; r: number;
  vy: number; sway: number; swayAmp: number;
  opacity: number; isAmber: boolean;
  fadeIn: number; fadeOut: number;
};

type Star = {
  x: number; y: number; r: number;
  phase: number; speed: number;  // twinkle
};

type Cloud = {
  x: number; y: number;          // position of cloud centre
  w: number; h: number;          // approximate bounding size
  vx: number;                    // drift speed px/ms
  opacity: number;
  puffs: { ox: number; oy: number; r: number }[];  // cluster of circles
};

// ── State ─────────────────────────────────────────────────────────────────────

let spores: Spore[] = [];
let stars:  Star[]  = [];
let clouds: Cloud[] = [];
let sporeLastTs = 0;

// ── Helpers ───────────────────────────────────────────────────────────────────

function rand(min: number, max: number) {
  return min + Math.random() * (max - min);
}

// ── Spore spawn ───────────────────────────────────────────────────────────────

function spawnSpore(): Spore {
  return {
    x:       rand(0, sporeCanvas.width),
    y:       sporeCanvas.height + rand(0, 60),
    r:       rand(SPORE_MIN_R, SPORE_MAX_R),
    vy:      rand(SPEED_MIN, SPEED_MAX),
    sway:    rand(0, Math.PI * 2),
    swayAmp: rand(0.003, DRIFT_MAX),
    opacity: rand(OPACITY_MIN, OPACITY_MAX),
    isAmber: Math.random() < 0.18,
    fadeIn:  0,
    fadeOut: 1,
  };
}

// ── Star spawn ────────────────────────────────────────────────────────────────
// Stars only live in the top 55% of the canvas (sky zone)

function spawnStar(): Star {
  return {
    x:     rand(0, sporeCanvas.width),
    y:     rand(0, sporeCanvas.height * 0.55),
    r:     rand(0.6, 1.8),
    phase: rand(0, Math.PI * 2),
    speed: rand(0.0005, 0.0015),  // very slow twinkle
  };
}

// ── Cloud spawn ───────────────────────────────────────────────────────────────
// A cloud is a cluster of overlapping circles. They drift from right to left
// (or spawn off-screen to the right and drift in).

function spawnCloud(offscreenRight = false): Cloud {
  const w       = rand(120, 280);
  const h       = rand(30, 65);
  const puffCount = Math.floor(rand(4, 8));
  const puffs: { ox: number; oy: number; r: number }[] = [];

  // Main body puffs spread across the cloud width
  for (let i = 0; i < puffCount; i++) {
    puffs.push({
      ox: rand(-w * 0.4, w * 0.4),
      oy: rand(-h * 0.2, h * 0.3),
      r:  rand(h * 0.5, h * 0.9),
    });
  }

  return {
    x:       offscreenRight
               ? sporeCanvas.width + w + rand(0, 200)
               : rand(-w, sporeCanvas.width + w),
    y:       rand(sporeCanvas.height * 0.04, sporeCanvas.height * 0.34),
    w, h,
    vx:      rand(0.006, 0.016),   // px/ms — very slow rightward-to-left drift
    opacity: rand(0.55, 0.85),
    puffs,
  };
}

// ── Init ──────────────────────────────────────────────────────────────────────

function initScene() {
  // Spores scattered across full height on load
  spores = Array.from({ length: SPORE_COUNT }, () => {
    const s = spawnSpore();
    s.y     = rand(0, sporeCanvas.height);
    s.fadeIn = 1; // already "in" at start
    return s;
  });

  // Stars scattered across sky zone
  stars = Array.from({ length: STAR_COUNT }, spawnStar);

  // Clouds — pre-placed across the sky
  clouds = Array.from({ length: CLOUD_COUNT }, () => spawnCloud(false));
}

function resizeSpores() {
  sporeCanvas.width  = window.innerWidth;
  sporeCanvas.height = window.innerHeight;
  initScene();
}

let sporeResizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener("resize", () => {
  if (sporeResizeTimer) clearTimeout(sporeResizeTimer);
  sporeResizeTimer = setTimeout(resizeSpores, 150);
});

// ── Draw loop ─────────────────────────────────────────────────────────────────

function drawSpores(ts: number) {
  const dt = Math.min(ts - sporeLastTs, 64);
  sporeLastTs = ts;

  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  const sky    = isDark ? SKY.dark  : SKY.light;
  const soil   = isDark ? SOIL.dark : SOIL.light;

  const w  = sporeCanvas.width;
  const h  = sporeCanvas.height;
  const hy = h * HORIZON_H;

  sporeCtx.clearRect(0, 0, w, h);

  // ── 1. Sky vertical wash ───────────────────────────────────────────────────
  // Fades from the sky colour at the very top to fully transparent at 62%
  // down the viewport so it blends seamlessly into whatever sits below.
  const skyTop  = isDark ? "rgba(5,12,30,0.92)"   : "rgba(184,216,240,0.88)";
  const skyMid  = isDark ? "rgba(10,22,40,0.60)"  : "rgba(218,237,248,0.55)";
  const skyFade =          "rgba(0,0,0,0)"; // always transparent at the bottom
  const skyGrad = sporeCtx.createLinearGradient(0, 0, 0, h * 0.62);
  skyGrad.addColorStop(0,    skyTop);
  skyGrad.addColorStop(0.45, skyMid);
  skyGrad.addColorStop(1,    skyFade);
  sporeCtx.fillStyle = skyGrad;
  sporeCtx.fillRect(0, 0, w, h * 0.62);

  // ── 3. Stars ──────────────────────────────────────────────────────────────
  // Each star twinkles on its own slow sine phase. In light mode they're
  // very faint blue dots — barely visible, as you'd expect in daylight.
  for (const star of stars) {
    star.phase += star.speed * dt;
    const twinkle = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(star.phase));
    // Stars fade out toward the horizon (below 45% height)
    const skyFade = Math.max(0, 1 - star.y / (h * 0.50));
    const alpha   = twinkle * sky.starOpMax * skyFade;
    if (alpha < 0.01) continue;
    sporeCtx.save();
    sporeCtx.globalAlpha = alpha;
    sporeCtx.fillStyle   = sky.star;
    sporeCtx.beginPath();
    sporeCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    sporeCtx.fill();
    sporeCtx.restore();
  }

  // ── 4. Clouds ─────────────────────────────────────────────────────────────
  // Each cloud drifts slowly to the left. When it exits the left edge it
  // is recycled off the right edge with a new random shape.
  for (const cloud of clouds) {
    // Move left
    cloud.x -= cloud.vx * dt;
    // Recycle off-screen left
    if (cloud.x < -cloud.w - 60) {
      Object.assign(cloud, spawnCloud(true));
    }

    // Fade clouds out near the horizon so they never sit on the soil
    const cloudFade = Math.max(0, 1 - (cloud.y / (h * 0.42)));
    const alpha     = cloud.opacity * cloudFade;
    if (alpha < 0.02) continue;

    sporeCtx.save();
    sporeCtx.globalAlpha = alpha;

    // Draw each puff circle — shadow first, then main white
    for (const puff of cloud.puffs) {
      // Subtle bottom shadow
      sporeCtx.fillStyle = sky.cloudShadow;
      sporeCtx.beginPath();
      sporeCtx.arc(cloud.x + puff.ox, cloud.y + puff.oy + puff.r * 0.18,
                   puff.r * 0.9, 0, Math.PI * 2);
      sporeCtx.fill();
    }
    for (const puff of cloud.puffs) {
      sporeCtx.fillStyle = sky.cloud;
      sporeCtx.beginPath();
      sporeCtx.arc(cloud.x + puff.ox, cloud.y + puff.oy, puff.r, 0, Math.PI * 2);
      sporeCtx.fill();
    }
    sporeCtx.restore();
  }

  // ── 5. Soil horizon ───────────────────────────────────────────────────────
  // Three overlapping rolling bezier curves at slightly different heights.
  // Drawn back-to-front so the bottom-most layer is richest in colour.
  const horizonLayers = [
    { color: soil.a, opacity: isDark ? 0.28 : 0.20, yOff:  22 },
    { color: soil.b, opacity: isDark ? 0.20 : 0.14, yOff:   0 },
    { color: soil.c, opacity: isDark ? 0.12 : 0.08, yOff: -20 },
  ];

  for (const layer of horizonLayers) {
    const y0 = hy + layer.yOff;
    sporeCtx.save();
    sporeCtx.globalAlpha = layer.opacity;
    sporeCtx.fillStyle   = layer.color;
    sporeCtx.beginPath();
    sporeCtx.moveTo(0, h);
    sporeCtx.lineTo(0, y0 + 10);
    sporeCtx.bezierCurveTo(w * 0.08, y0 - 28, w * 0.18, y0 + 18, w * 0.28, y0 - 10);
    sporeCtx.bezierCurveTo(w * 0.38, y0 - 38, w * 0.48, y0 + 22, w * 0.55, y0 + 4);
    sporeCtx.bezierCurveTo(w * 0.62, y0 - 14, w * 0.70, y0 - 32, w * 0.78, y0 + 8);
    sporeCtx.bezierCurveTo(w * 0.85, y0 + 26, w * 0.92, y0 - 16, w,        y0 + 12);
    sporeCtx.lineTo(w, h);
    sporeCtx.closePath();
    sporeCtx.fill();
    sporeCtx.restore();
  }

  // ── 6. Spore particles ────────────────────────────────────────────────────
  // Green palette in light mode, brighter in dark. Spores fade out as they
  // rise into the sky zone so they feel like they're escaping from the soil.
  const sporeGreen = isDark ? "#22c55e" : "#16a34a";
  const sporeAmber = isDark ? "#f59e0b" : "#b45309";

  for (let i = 0; i < spores.length; i++) {
    const s = spores[i];
    s.y    -= s.vy * dt;
    s.sway += SWAY_SPEED * dt;
    s.x    += Math.sin(s.sway) * s.swayAmp * dt;
    s.fadeIn = Math.min(1, s.fadeIn + 0.0008 * dt);

    // Fade out both near the top and as they enter the sky zone
    const topThreshold = h * 0.15;
    s.fadeOut = s.y < topThreshold ? Math.max(0, s.y / topThreshold) : 1;

    if (s.y < -s.r * 2) { spores[i] = spawnSpore(); continue; }

    const alpha = s.opacity * s.fadeIn * s.fadeOut;
    if (alpha < 0.005) continue;

    sporeCtx.save();
    sporeCtx.globalAlpha = alpha;
    sporeCtx.fillStyle   = s.isAmber ? sporeAmber : sporeGreen;
    sporeCtx.beginPath();
    sporeCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    sporeCtx.fill();
    sporeCtx.restore();
  }

  requestAnimationFrame(drawSpores);
}


// ── Program types ─────────────────────────────────────────────────────────────

type BuiltinProgram = { id: number; name: string; code: string; source: "builtin" };
type SavedProgram   = { id: number; name: string; code: string; createdAt?: string | null; source: "saved" };
type ProgramRecord  = BuiltinProgram | SavedProgram;

const BUILTIN_PROGRAMS: BuiltinProgram[] = [
  { id: 0, name: "Hello World", code: 'print("Hello World");', source: "builtin" },
];

let programList: ProgramRecord[]          = [];
let currentProgramId: number | null       = null;
let currentProgramSource: "builtin" | "saved" | null = null;

// The code that was last saved / loaded — compared against editor.value to
// determine whether there are unsaved changes.
let lastSavedCode: string = "";


// ── Server API ────────────────────────────────────────────────────────────────

const API_BASE = "http://localhost:3000";

async function fetchSavedPrograms(): Promise<SavedProgram[]> {
  const response = await fetch(`${API_BASE}/programs`);
  if (!response.ok) throw new Error("Failed to fetch programs.");
  const rows = await response.json();
  return rows.map((row: any) => ({
    id:        Number(row.id),
    name:      String(row.name),
    code:      String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source:    "saved" as const,
  }));
}

async function fetchSavedProgramById(id: number): Promise<SavedProgram> {
  const response = await fetch(`${API_BASE}/programs/${id}`);
  if (!response.ok) throw new Error("Failed to load program.");
  const row = await response.json();
  return {
    id:        Number(row.id),
    name:      String(row.name),
    code:      String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source:    "saved",
  };
}

async function saveProgramToServer(id: number | null, name: string, code: string): Promise<SavedProgram> {
  const response = await fetch(`${API_BASE}/programs`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ id, name, code }),
  });
  if (!response.ok) throw new Error("Failed to save program.");
  const row = await response.json();
  return {
    id:        Number(row.id),
    name:      String(row.name),
    code:      String(row.code),
    createdAt: row.createdAt ?? row.created_at ?? null,
    source:    "saved",
  };
}

async function deleteProgramFromServer(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/programs/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Failed to delete program.");
}


// ── FEATURE: Toast notifications ──────────────────────────────────────────────
// Replaces window.alert() / window.confirm() feedback with non-blocking toasts.
// Each toast slides in from the right, auto-dismisses after `duration` ms,
// and can also be dismissed manually with the × button.

type ToastKind = "success" | "error";

function showToast(message: string, kind: ToastKind = "success", duration = 3500) {
  const toast = document.createElement("div");
  toast.className = `toast${kind === "error" ? " toast-error" : ""}`;

  // Icon — ✓ for success, ✕ for error
  const icon = document.createElement("span");
  icon.className   = "toast-icon";
  icon.textContent = kind === "success" ? "✓" : "✕";

  // Message text
  const msg = document.createElement("span");
  msg.textContent = message;

  // Dismiss button
  const dismiss = document.createElement("button");
  dismiss.className   = "toast-dismiss";
  dismiss.textContent = "✕";
  dismiss.setAttribute("aria-label", "Dismiss notification");

  toast.appendChild(icon);
  toast.appendChild(msg);
  toast.appendChild(dismiss);
  toastContainer.appendChild(toast);

  // Helper that animates the toast out then removes it from the DOM
  function removeToast() {
    toast.classList.add("toast-out");
    // Wait for the slide-out animation to finish before removing the element
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
  }

  dismiss.addEventListener("click", removeToast);
  setTimeout(removeToast, duration);
}


// ── FEATURE: Unsaved-changes indicator ───────────────────────────────────────
// Compares the current editor content with lastSavedCode on every keystroke.
// Shows an amber dot on the Save button and the "● unsaved" label when they differ.

function updateUnsavedState() {
  const hasChanges = editor.value !== lastSavedCode;

  // Amber dot on the Save button
  saveBtn.classList.toggle("has-unsaved", hasChanges);

  // "● unsaved" label to the right of the action buttons
  unsavedLabel.classList.toggle("is-hidden", !hasChanges);
}

// Call this whenever a program is successfully saved or freshly loaded
function markAsSaved(code: string) {
  lastSavedCode = code;
  updateUnsavedState();
}


// ── FEATURE: Status bar ───────────────────────────────────────────────────────
// Updates the three status bar spans and the active-line highlight in the gutter
// on every cursor move / keystroke.

function updateStatusBar() {
  const src    = editor.value;
  const pos    = editor.selectionStart ?? 0;
  const before = src.slice(0, pos);
  const lines  = before.split("\n");

  const ln  = lines.length;
  const col = lines[lines.length - 1].length + 1;

  statusCursor.textContent = `Ln ${ln}, Col ${col}`;
  statusChars.textContent  = `${src.length} char${src.length !== 1 ? "s" : ""}`;
  statusLines.textContent  = `${src.split("\n").length} line${src.split("\n").length !== 1 ? "s" : ""}`;

  // Highlight the active line number in the gutter
  const gutter = document.querySelector<HTMLDivElement>(".gutter");
  if (gutter) {
    gutter.querySelectorAll(".line").forEach((el, idx) => {
      el.classList.toggle("active-line", idx + 1 === ln);
    });
  }
}


// ── FEATURE: Dynamic gutter line numbers ─────────────────────────────────────
// Rebuilds the gutter whenever the line count changes so the numbers always
// match the actual content without any manual syncing.

function syncGutter() {
  const gutter = document.querySelector<HTMLDivElement>(".gutter");
  if (!gutter) return;

  const lineCount = editor.value.split("\n").length;

  // Cache the current line elements once — do not re-query inside the loops
  let lines    = gutter.querySelectorAll<HTMLDivElement>(".line");
  let existing = lines.length;

  // Add any missing line number divs
  for (let i = existing + 1; i <= lineCount; i++) {
    const div = document.createElement("div");
    div.className   = "line";
    div.textContent = String(i);
    gutter.appendChild(div);
  }

  // Remove excess line number divs from the bottom.
  // Re-query only once after potential additions so we have the full list.
  if (existing > lineCount) {
    lines = gutter.querySelectorAll<HTMLDivElement>(".line");
    for (let i = lines.length - 1; i >= lineCount; i--) {
      lines[i].remove();
    }
  }

  // Scroll sync is handled exclusively by the editor's "scroll" event listener.
  // Setting scrollTop here would fight against the browser's own scroll
  // restoration after a paste or programmatic value assignment.
}


// ── Program dropdown ──────────────────────────────────────────────────────────

async function renderProgramDropdown() {
  const savedPrograms = await fetchSavedPrograms();
  programList = [...BUILTIN_PROGRAMS, ...savedPrograms];

  examples.innerHTML = "";
  for (const program of programList) {
    const option = document.createElement("option");
    option.value       = `${program.source}:${program.id}`;
    option.textContent = program.name;
    examples.appendChild(option);
  }

  if (currentProgramId !== null && currentProgramSource !== null) {
    const value  = `${currentProgramSource}:${currentProgramId}`;
    const exists = Array.from(examples.options).some(opt => opt.value === value);
    if (exists) examples.value = value;
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
    currentProgramId     = program.id;
    currentProgramSource = "builtin";
    editor.value         = program.code;
    // Reset scroll before syncing so gutter starts at line 1
    editor.scrollTop     = 0;
    editor.scrollLeft    = 0;
    setEditorLabel(program.name);
    examples.value       = `builtin:${program.id}`;
    markAsSaved(program.code);
    syncHighlight();
    syncGutter();
    updateStatusBar();
    return;
  }
  const program = await fetchSavedProgramById(id);
  currentProgramId     = program.id;
  currentProgramSource = "saved";
  editor.value         = program.code;
  // Reset scroll before syncing so gutter starts at line 1
  editor.scrollTop     = 0;
  editor.scrollLeft    = 0;
  setEditorLabel(program.name);
  examples.value       = `saved:${program.id}`;
  markAsSaved(program.code);
  syncHighlight();
  syncGutter();
  updateStatusBar();
}

async function initializePrograms() {
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
}


// ── Tab management ────────────────────────────────────────────────────────────

function setActiveTab(id: string) {
  tabs.forEach(t  => t.classList.toggle("is-active", t.dataset.tab === id));
  panes.forEach(p => p.classList.toggle("is-hidden",  p.dataset.pane !== id));
}


// ── Debug visualization helpers ───────────────────────────────────────────────

function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
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
  if (node.kind === "ExprStmt")  return `${indent}ExprStmt\n${astToTree(node.expr, indent + "  ")}`;
  if (node.kind === "VarDecl")   return `${indent}VarDecl(${node.name})\n${astToTree(node.initializer, indent + "  ")}`;
  if (node.kind === "Assign")    return `${indent}Assign(${node.name})\n${astToTree(node.value, indent + "  ")}`;
  if (node.kind === "FnDecl")    return `${indent}FnDecl(${node.name})(${node.params?.join(", ")})\n${astToTree(node.body, indent + "  ")}`;
  if (node.kind === "Return")    return `${indent}Return${node.value ? "\n" + astToTree(node.value, indent + "  ") : ""}`;
  if (node.kind === "If") {
    const lines = [`${indent}If\n${astToTree(node.condition, indent + "  ")}\n${astToTree(node.then, indent + "  ")}`];
    if (node.else) lines.push(astToTree(node.else, indent + "  "));
    return lines.join("\n");
  }
  if (node.kind === "While") return `${indent}While\n${astToTree(node.condition, indent + "  ")}\n${astToTree(node.body, indent + "  ")}`;
  if (node.kind === "Block") {
    const lines = [`${indent}Block`];
    for (const s of node.statements ?? []) lines.push(astToTree(s, indent + "  "));
    return lines.join("\n");
  }
  if (node.kind === "Number")  return `${indent}Number(${node.value})`;
  if (node.kind === "String")  return `${indent}String("${node.value}")`;
  if (node.kind === "Boolean") return `${indent}Boolean(${node.value})`;
  if (node.kind === "Unary")   return `${indent}Unary(${node.op})\n${astToTree(node.operand, indent + "  ")}`;
  if (node.kind === "Binary")  return `${indent}Binary("${node.op}")\n${astToTree(node.left, indent + "  ")}\n${astToTree(node.right, indent + "  ")}`;
  if (node.kind === "Call") {
    const lines = [`${indent}Call("${node.callee}")`];
    for (const a of node.args ?? []) lines.push(astToTree(a, indent + "  "));
    return lines.join("\n");
  }
  return `${indent}${JSON.stringify(node)}`;
}


// ── FEATURE: Colorized, timestamped output ────────────────────────────────────
// Instead of writing plain text into outBox, we build a series of .out-row divs
// so each line gets a muted timestamp, a colored prefix glyph, and styled text.

// Returns the current time as "hh:mm:ss"
function nowTimestamp(): string {
  return new Date().toLocaleTimeString("en-US", { hour12: false });
}

// Append a single row to the output panel
function appendOutputRow(
  container: HTMLPreElement,
  text: string,
  kind: "ok" | "error"
) {
  const row = document.createElement("div");
  row.className = "out-row";

  const ts = document.createElement("span");
  ts.className   = "out-ts";
  ts.textContent = nowTimestamp();

  const prefix = document.createElement("span");
  prefix.className   = kind === "ok" ? "out-prefix-ok" : "out-prefix-err";
  prefix.textContent = kind === "ok" ? ">" : "✕";

  const msg = document.createElement("span");
  msg.className   = kind === "ok" ? "out-msg-ok" : "out-msg-err";
  msg.textContent = text;

  row.appendChild(ts);
  row.appendChild(prefix);
  row.appendChild(msg);
  container.appendChild(row);
}

// Build the full output panel content from a run result
function renderOutputPanel(outputLines: string[], errorMsg?: string) {
  outBox.innerHTML = "";  // clear previous content
  outBox.classList.remove("typewriter-active");

  if (outputLines.length === 0 && !errorMsg) {
    // No output at all — show a muted "(no output)" placeholder
    const empty = document.createElement("span");
    empty.className   = "out-empty";
    empty.textContent = "(no output)";
    outBox.appendChild(empty);
    return;
  }

  // Write each captured print() line as a green "ok" row
  for (const line of outputLines) {
    appendOutputRow(outBox, line, "ok");
  }

  // If there was a runtime/syntax error, append it as a red "error" row
  if (errorMsg) {
    appendOutputRow(outBox, errorMsg, "error");
  }
}


// ── Output reset ──────────────────────────────────────────────────────────────

function renderEmpty() {
  outBox.innerHTML   = "";
  tokBox.textContent = "";
  astBox.textContent = "";
  envBox.textContent = "";
  hideErrorBar();
}


// ── Typewriter output (kept for compatibility — now unused for the main path) ─
// The original typewriter is no longer used for run output since we now build
// DOM rows instead of setting textContent. Kept here in case other code paths
// reference it.

let typewriterTimer: ReturnType<typeof setTimeout> | null = null;

function typewriterWrite(el: HTMLPreElement, text: string) {
  if (typewriterTimer !== null) {
    clearTimeout(typewriterTimer);
    typewriterTimer = null;
  }
  el.textContent = "";
  el.classList.add("typewriter-active");

  let i = 0;
  const CHARS_PER_TICK = 3;
  const TICK_MS        = 12;

  function tick() {
    if (i >= text.length) {
      el.classList.remove("typewriter-active");
      typewriterTimer = null;
      return;
    }
    el.textContent += text.slice(i, i + CHARS_PER_TICK);
    i += CHARS_PER_TICK;
    typewriterTimer = setTimeout(tick, TICK_MS);
  }
  tick();
}


// ── Run button animation ──────────────────────────────────────────────────────

function setRunning(running: boolean) {
  runBtn.classList.toggle("is-running", running);
  runBtn.disabled = running;
}


// ── Error highlighting ────────────────────────────────────────────────────────

function hideErrorBar() {
  errorBar.classList.add("is-hidden");
  errorBar.textContent = "";
  document.querySelectorAll(".error-line-highlight").forEach(el => el.remove());
}

function offsetToLineCol(source: string, offset: number): { line: number; col: number } {
  const before = source.slice(0, Math.min(offset, source.length));
  const lines  = before.split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

function findErrorOffset(source: string, errorMsg: string): number | null {
  const indexMatch = errorMsg.match(/at index (\d+)/);
  if (indexMatch) return Number(indexMatch[1]);

  try {
    const tokens = lex(source);
    const lexemeMatch = errorMsg.match(/near '([^']+)'/);
    if (lexemeMatch) {
      const badLexeme = lexemeMatch[1];
      const tok = tokens.find(t => t.lexeme === badLexeme);
      if (tok && tok.index !== undefined) return tok.index;
    }
    if (tokens.length >= 2) return tokens[tokens.length - 2].index ?? null;
  } catch {
    // swallow re-lex errors
  }
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

  if (offset !== null) {
    const { line } = offsetToLineCol(source, offset);
    editor.dataset.errorLine = String(line);
    editor.classList.add("has-error-line");
    setTimeout(() => {
      editor.classList.remove("has-error-line");
      delete editor.dataset.errorLine;
    }, 4000);
  }
}


// ── Editor resize (no-op — CSS enforces fixed height) ────────────────────────

function autoResizeEditor() { /* CSS fixed height handles this */ }


// ── Syntax highlighting overlay ───────────────────────────────────────────────

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildHighlightedHtml(src: string): string {
  let out = "";
  let i   = 0;

  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);

  while (i < src.length) {
    const c = src[i];

    if (c === " " || c === "\t" || c === "\r" || c === "\n") {
      out += escapeHtml(c);
      i++;
      continue;
    }

    // Number literal
    if (isDigit(c)) {
      const start = i;
      while (i < src.length && isDigit(src[i])) i++;
      if (src[i] === "." && isDigit(src[i + 1] ?? "")) {
        i++;
        while (i < src.length && isDigit(src[i])) i++;
      }
      out += `<span class="syn-num">${escapeHtml(src.slice(start, i))}</span>`;
      continue;
    }

    // String literal
    if (c === '"') {
      const start = i;
      i++;
      while (i < src.length && src[i] !== '"' && src[i] !== "\n") {
        if (src[i] === "\\") i++;
        i++;
      }
      if (i < src.length) i++;
      out += `<span class="syn-str">${escapeHtml(src.slice(start, i))}</span>`;
      continue;
    }

    // Identifier or keyword — peek ahead for "(" to flag as a function call
    if (isAlpha(c)) {
      const start = i;
      while (i < src.length && isAlnum(src[i])) i++;
      const word = src.slice(start, i);
      let j = i;
      while (j < src.length && (src[j] === " " || src[j] === "\t")) j++;
      const isFn = src[j] === "(";
      const cls  = isFn ? "syn-fn" : "syn-ident";
      out += `<span class="${cls}">${escapeHtml(word)}</span>`;
      continue;
    }

    if ("+-*/".includes(c)) {
      out += `<span class="syn-op">${escapeHtml(c)}</span>`;
      i++;
      continue;
    }

    if ("();,".includes(c)) {
      out += `<span class="syn-punc">${escapeHtml(c)}</span>`;
      i++;
      continue;
    }

    out += escapeHtml(c);
    i++;
  }

  return out;
}

function syncHighlight() {
  if (!highlightOverlay) return;
  highlightOverlay.innerHTML = buildHighlightedHtml(editor.value) + "\n";
  highlightOverlay.scrollTop  = editor.scrollTop;
  highlightOverlay.scrollLeft = editor.scrollLeft;
}

editor.addEventListener("scroll", () => {
  // Keep the syntax highlight overlay locked to the textarea's scroll position
  if (highlightOverlay) {
    highlightOverlay.scrollTop  = editor.scrollTop;
    highlightOverlay.scrollLeft = editor.scrollLeft;
  }
  // Keep the gutter locked — this is the single source of truth for gutter scrollTop
  const gutter = document.querySelector<HTMLDivElement>(".gutter");
  if (gutter) gutter.scrollTop = editor.scrollTop;
});

// On every keystroke: update highlight overlay, gutter, status bar, and unsaved state
editor.addEventListener("input", () => {
  syncHighlight();
  syncGutter();
  updateStatusBar();
  updateUnsavedState();
  autoResizeEditor();
});

// On cursor move (click, arrow keys, etc.): update status bar
editor.addEventListener("click",   updateStatusBar);
editor.addEventListener("keyup",   updateStatusBar);
editor.addEventListener("selectionchange", updateStatusBar);


// ── Canvas and graphics bridge ────────────────────────────────────────────────

const gameCanvas = document.querySelector<HTMLCanvasElement>("#gameCanvas")!;
const ctx        = gameCanvas.getContext("2d")!;
const WIDTH      = gameCanvas.width;
const HEIGHT     = gameCanvas.height;

let currentFillColor = "#ffffff";

function drawBackground() {
  ctx.fillStyle   = "#0b1220";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(1, 1, WIDTH - 2, HEIGHT - 2);
}

const dirtGraphics = {
  clear() { drawBackground(); },
  rect(x: number, y: number, width: number, height: number) {
    ctx.fillStyle = currentFillColor;
    ctx.fillRect(x, y, width, height);
  },
  circle(x: number, y: number, radius: number) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = currentFillColor;
    ctx.fill();
    ctx.closePath();
  },
  fillColor(color: string) { currentFillColor = color; },
  width()  { return WIDTH; },
  height() { return HEIGHT; },
};

drawBackground();


// ── Keyboard input ────────────────────────────────────────────────────────────

const keysDown = new Set<string>();
window.addEventListener("keydown", e => keysDown.add(e.key));
window.addEventListener("keyup",   e => keysDown.delete(e.key));

const dirtInput = {
  keyDown(key: string): boolean { return keysDown.has(key); },
};


// ── Game loop ─────────────────────────────────────────────────────────────────

let activeUpdateFn: DirtCallable | null = null;
let activeInterpreter: any = null;
let activeUpdateEnv: any = null;
let rafId: number | null = null;

function stopGameLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  activeUpdateFn    = null;
  activeInterpreter = null;
  activeUpdateEnv   = null;
}

function startGameLoop() {
  function frame() {
    if (!activeUpdateFn || !activeInterpreter) return;
    try {
      activeInterpreter.evaluate(
        { kind: "Call", callee: "__update__", args: [] },
        activeUpdateEnv
      );
    } catch (e) {
      // Surface game loop runtime errors in the output panel
      renderOutputPanel([], `Runtime error: ${e instanceof Error ? e.message : String(e)}`);
      stopGameLoop();
      setActiveTab("output");
      return;
    }
    rafId = requestAnimationFrame(frame);
  }
  rafId = requestAnimationFrame(frame);
}


// ── Run ───────────────────────────────────────────────────────────────────────

function run() {
  stopGameLoop();
  hideErrorBar();
  currentFillColor = "#ffffff";

  setRunning(true);

  // Defer so the button repaint happens before the synchronous interpreter run
  setTimeout(() => {
    let capturedUpdateFn: DirtCallable | null = null;

    const result = runProgramDebug(editor.value, {
      sourcePath: "web-ide",
      graphics:   dirtGraphics,
      input:      dirtInput,
      onUpdate(fn: DirtCallable) { capturedUpdateFn = fn; },
    });

    setRunning(false);

    if (!result.ok) {
      const errorMsg = result.error ?? "Unknown error";

      // Show any output that printed before the crash, then the error row
      renderOutputPanel(result.output ?? [], errorMsg);
      tokBox.textContent = "";
      astBox.textContent = "";
      envBox.textContent = "";
      showErrorBar(editor.value, errorMsg);
      setActiveTab("output");
      return;
    }

    // Populate debug panels
    tokBox.textContent = result.tokens.map(tokenToPrettyLine).join("\n");
    astBox.textContent = astToTree(result.ast);
    envBox.textContent = JSON.stringify(result.env, null, 2);

    // Render colorized output rows
    renderOutputPanel(result.output, undefined);

    setActiveTab("output");

    if (capturedUpdateFn) {
      const tokens  = lex(editor.value);
      const program = parse(tokens);
      const env     = new Environment();
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


// ── Project actions ───────────────────────────────────────────────────────────

async function saveCurrentProgram() {
  const current = currentProgramSource === "saved"
    ? programList.find(p => p.source === "saved"   && p.id === currentProgramId)
    : programList.find(p => p.source === "builtin" && p.id === currentProgramId);

  const name = window.prompt("Enter a project name:", current?.name ?? "New Program");
  if (!name?.trim()) return;

  const savedId      = currentProgramSource === "saved" ? currentProgramId : null;
  const savedProgram = await saveProgramToServer(savedId, name.trim(), editor.value);

  currentProgramId     = savedProgram.id;
  currentProgramSource = "saved";
  markAsSaved(savedProgram.code);   // clear unsaved indicator

  await renderProgramDropdown();
  await loadProgramIntoEditor("saved", savedProgram.id);

  showToast(`Saved "${savedProgram.name}"`, "success");
}

function createNewProgram() {
  stopGameLoop();
  currentProgramId     = null;
  currentProgramSource = null;
  editor.value         = "";
  lastSavedCode        = "";           // new blank document = nothing to compare against
  updateUnsavedState();
  setEditorLabel("Untitled");
  renderEmpty();
  syncHighlight();
  syncGutter();
  updateStatusBar();
  setActiveTab("output");
}

async function deleteCurrentProgram() {
  if (currentProgramId === null || currentProgramSource === null) return;

  if (currentProgramSource === "builtin") {
    showToast("Built-in programs cannot be deleted.", "error");
    return;
  }

  const current = programList.find(p => p.source === "saved" && p.id === currentProgramId);
  if (!current) return;

  // Still use confirm() for destructive actions — the user must explicitly agree
  if (!window.confirm(`Delete "${current.name}"?`)) return;

  await deleteProgramFromServer(current.id);
  stopGameLoop();

  currentProgramId     = 0;
  currentProgramSource = "builtin";
  await renderProgramDropdown();
  await loadProgramIntoEditor("builtin", 0);
  renderEmpty();

  showToast(`Deleted "${current.name}"`, "success");
}


// ── Event listeners ───────────────────────────────────────────────────────────

tabs.forEach(btn => {
  btn.addEventListener("click", () => setActiveTab(btn.dataset.tab!));
});

examples.addEventListener("change", async () => {
  stopGameLoop();
  const [source, idText] = examples.value.split(":");
  const id = Number(idText);
  if (source === "builtin") await loadProgramIntoEditor("builtin", id);
  else                      await loadProgramIntoEditor("saved",   id);
});

runBtn.addEventListener("click", run);

clearBtn.addEventListener("click", () => {
  stopGameLoop();
  renderEmpty();
  editor.value = "";
  syncHighlight();
  syncGutter();
  updateStatusBar();
  updateUnsavedState();
  setActiveTab("output");
});

saveBtn.addEventListener("click", async () => {
  try   { await saveCurrentProgram(); }
  catch (error) {
    console.error(error);
    showToast("Could not save program.", "error");
  }
});

newBtn.addEventListener("click", createNewProgram);

deleteBtn.addEventListener("click", async () => {
  try   { await deleteCurrentProgram(); }
  catch (error) {
    console.error(error);
    showToast("Could not delete program.", "error");
  }
});


// ── Initialization ────────────────────────────────────────────────────────────

(async function init() {
  try   { await initializePrograms(); }
  catch (error) {
    console.error(error);
    showToast("Could not load programs from the database.", "error");
  }
  renderEmpty();
  syncHighlight();
  syncGutter();
  updateStatusBar();
  setActiveTab("output");

  // Boot the spore drift background — size canvas, scatter initial particles,
  // start the draw loop. rAF ensures the canvas has real dimensions first.
  resizeSpores();
  sporeLastTs = performance.now();
  requestAnimationFrame(drawSpores);
})();