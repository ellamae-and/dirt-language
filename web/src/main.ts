import "./style.css";

import { runProgramDebug } from "../../dirt/runtime/runProgram";

/* ======================================================
   THEME TOGGLE (Light / Dark)
====================================================== */

// Root HTML element used to toggle theme attributes
const root = document.documentElement;
// Theme toggle button in the header
const themeToggle = document.querySelector<HTMLButtonElement>("#themeToggle");

if (themeToggle) {
   // Icon elements inside the toggle button
  const icon = themeToggle.querySelector<HTMLElement>(".icon");
  const iconText = themeToggle.querySelector<HTMLElement>(".icon-text");

    /**
   * Applies the selected theme to the page
   * @param mode "light" or "dark"
   */
  function setTheme(mode: "light" | "dark") {
      // Dark theme
    if (mode === "dark") {
      root.setAttribute("data-theme", "dark");
      if (icon) icon.textContent = "";
      if (iconText) iconText.textContent = "Dark";
          // Light theme
    } else {
      root.removeAttribute("data-theme");
      if (icon) icon.textContent = "";
      if (iconText) iconText.textContent = "Light";
    }
  }

    /**
   * Initializes the theme when the page loads.
   * Checks localStorage first, otherwise uses system preference.
   */
  function initTheme() {
        // Load saved theme from browser storage
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;


    // If user has never selected a theme, follow system preference
    if (!saved) {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
      return;
    }

    // Apply saved theme
    setTheme(saved);
  }

    // Toggle theme when button is clicked
  themeToggle.addEventListener("click", () => {
    const isDark = root.getAttribute("data-theme") === "dark";
        // Switch to opposite theme
    const next: "light" | "dark" = isDark ? "light" : "dark";
    setTheme(next);
        // Save user preference
    localStorage.setItem("theme", next);
  });

    // Run theme initialization
  initTheme();
}

/* ======================================================
   EXISTING IDE LOGIC
====================================================== */

// Code editor where users type Dirt programs
const editor = document.querySelector<HTMLTextAreaElement>("#editor")!;
// Example program dropdown
const examples = document.querySelector<HTMLSelectElement>("#examples")!;

// Run / clear buttons
const runBtn = document.querySelector<HTMLButtonElement>("#runBtn")!;
const clearBtn = document.querySelector<HTMLButtonElement>("#clearBtn")!;

// Output panels
const outBox = document.querySelector<HTMLPreElement>("#outBox")!;
const tokBox = document.querySelector<HTMLPreElement>("#tokBox")!;
const astBox = document.querySelector<HTMLPreElement>("#astBox")!;
const envBox = document.querySelector<HTMLPreElement>("#envBox")!;

// Tab buttons and pane containers
const tabs = Array.from(document.querySelectorAll<HTMLButtonElement>(".tab"));
const panes = Array.from(document.querySelectorAll<HTMLElement>("[data-pane]"));


/* ======================================================
   BUILT-IN EXAMPLE PROGRAMS
====================================================== */
const EXAMPLES: Record<string, { fileLabel: string; code: string }> = {
  hello: {
    fileLabel: "examples/hello.dirt",
    code: "print(1 + 2 * 3);",
  },
  math: {
    fileLabel: "examples/math.dirt",
    code: "print(10 / 2 + 7 * 2);\nprint(5 + 5 * 5);",
  },
  multi: {
    fileLabel: "examples/multi.dirt",
    code: "print(1 + 2);\nprint(3 * 4);\nprint(9 - 2);",
  },
};

/* ======================================================
   TAB MANAGEMENT
====================================================== */

/**
 * Activates a specific output tab and hides others
 */

  // Highlight selected tab button
function setActiveTab(id: string) {
  tabs.forEach(t => t.classList.toggle("is-active", t.dataset.tab === id));
    // Show corresponding pane
  panes.forEach(p => p.classList.toggle("is-hidden", p.dataset.pane !== id));
}


/* ======================================================
   DEBUG VISUALIZATION HELPERS
====================================================== */

/**
 * Formats tokens into readable debug lines
 */

function tokenToPrettyLine(t: any): string {
  if (t.type === undefined) return JSON.stringify(t);
  if (t.literal !== undefined) return `Token(type=${t.type}, lexeme="${t.lexeme}", literal=${t.literal})`;
  if (t.lexeme) return `Token(type=${t.type}, lexeme="${t.lexeme}")`;
  return `Token(type=${t.type})`;
}

/**
 * Converts AST nodes into a tree-style debug display
 */
function astToTree(node: any, indent = ""): string {
  if (!node) return `${indent}<null>`;

  if (node.kind === "Program") {
    const lines = [`${indent}Program`];
    for (const s of node.statements ?? []) lines.push(astToTree(s, indent + "  "));
    return lines.join("\n");
  }

    // Expression statement
  if (node.kind === "ExprStmt") {
    return `${indent}ExprStmt\n${astToTree(node.expr, indent + "  ")}`;
  }

    // Number literal
  if (node.kind === "Number") return `${indent}Number(${node.value})`;

    // Binary operation
  if (node.kind === "Binary") {
    return [
      `${indent}Binary("${node.op}")`,
      astToTree(node.left, indent + "  "),
      astToTree(node.right, indent + "  "),
    ].join("\n");
  }

    // Function call
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
 * Clears all output panels
 */
function renderEmpty() {
  outBox.textContent = "";
  tokBox.textContent = "";
  astBox.textContent = "";
  envBox.textContent = "";
}

/**
 * Executes the current program in the editor
 * and displays interpreter debug output
 */

function run() {
  const source = editor.value;

    // Execute Dirt interpreter
  const result = runProgramDebug(source, { sourcePath: "web-ide" });

    // Handle runtime error
  if (!result.ok) {
    outBox.textContent =
      (result.output?.length
        ? result.output.map(x => `> ${x}`).join("\n") + "\n"
        : "") + `Error: ${result.error}`;
    tokBox.textContent = "";
    astBox.textContent = "";
    envBox.textContent = "";
    setActiveTab("output");
    return;
  }
    // Display program output
  outBox.textContent = result.output.length
    ? result.output.map(x => `> ${x}`).join("\n")
    : "> (no output)";

  // Display debugging information
  tokBox.textContent = result.tokens.map(tokenToPrettyLine).join("\n");
  astBox.textContent = astToTree(result.ast);
  envBox.textContent = JSON.stringify(result.env, null, 2);

  setActiveTab("output");
}


/* ======================================================
   EXAMPLE LOADER
====================================================== */

/**
 * Loads a sample Dirt program into the editor
 */

function setExample(key: string) {
  const ex = EXAMPLES[key] ?? EXAMPLES.hello;
  editor.value = ex.code;

  const chip = document.querySelector<HTMLElement>(".chip");
  if (chip) chip.textContent = `File: ${ex.fileLabel}`;
}

/* ======================================================
   EVENT LISTENERS
====================================================== */

// Tab switching
tabs.forEach(btn => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.tab!;
    setActiveTab(id);
  });
});

// Example dropdown
examples.addEventListener("change", () => setExample(examples.value));
// Run program
runBtn.addEventListener("click", run);
// Clear editor/output
clearBtn.addEventListener("click", () => {
  renderEmpty();
  editor.value = "";
  setActiveTab("output");
});

/* ======================================================
   INITIALIZATION
====================================================== */

// Load default example
setExample("hello");
// Clear outputs
renderEmpty();
// Default tab
setActiveTab("output");