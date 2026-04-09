// builtins.ts
// Registers all built-in functions into the global environment.
//
// These are the functions that Dirt programs can call without defining them first —
// things like print(), circle(), and keyDown(). They're implemented in TypeScript
// and injected into the environment before the program starts running.
//
// Each builtin is stored in the environment as a plain JS function value,
// so when the interpreter hits a Call node it just finds the function and calls it —
// it doesn't need to know whether it's a builtin or a user-defined function.

import { Environment } from "../runtime/environment.js";
import type { DirtConfig } from "../runtime/runProgram.js";


// Guard helpers — used to validate that arguments have the right type before
// passing them to JS functions. If a Dirt program calls  circle("hello", 0, 5)
// these will throw a clear error instead of silently producing NaN.

function expectNumber(value: unknown, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number, got ${typeof value}.`);
  }
  return value;
}

function expectString(value: unknown, name: string): string {
  if (typeof value !== "string") {
    throw new Error(`${name} must be a string, got ${typeof value}.`);
  }
  return value;
}


export function registerBuiltins(env: Environment, config: DirtConfig) {

  // ── Output ──────────────────────────────────────────────────────────────────

  // print(value, ...) — print one or more values to the console / IDE output panel.
  env.define("print", (...args: unknown[]) => {
    console.log(...args);
    return null; // all Dirt builtins return null if they don't have a meaningful value to give back
  });


  // ── Math ────────────────────────────────────────────────────────────────────
  // Thin wrappers around JS's Math object. Each validates its argument first.

  env.define("abs",   (x: unknown) => Math.abs(expectNumber(x, "abs")));
  env.define("floor", (x: unknown) => Math.floor(expectNumber(x, "floor")));
  env.define("ceil",  (x: unknown) => Math.ceil(expectNumber(x, "ceil")));
  env.define("round", (x: unknown) => Math.round(expectNumber(x, "round")));
  env.define("sqrt",  (x: unknown) => Math.sqrt(expectNumber(x, "sqrt")));
  env.define("sin",   (x: unknown) => Math.sin(expectNumber(x, "sin")));
  env.define("cos",   (x: unknown) => Math.cos(expectNumber(x, "cos")));
  env.define("min",   (a: unknown, b: unknown) => Math.min(expectNumber(a, "min a"), expectNumber(b, "min b")));
  // mod(a, b) — remainder after dividing a by b, e.g. mod(10, 3) → 1
  // Dirt has no % operator so this is how FizzBuzz-style divisibility checks work.
  env.define("mod", (a: unknown, b: unknown) => expectNumber(a, "mod a") % expectNumber(b, "mod b"));
  env.define("max",   (a: unknown, b: unknown) => Math.max(expectNumber(a, "max a"), expectNumber(b, "max b")));

  // random()       → a random number between 0 and 1
  // random(n)      → a random number between 0 and n
  // random(lo, hi) → a random number between lo and hi
  env.define("random", (lo: unknown = undefined, hi: unknown = undefined) => {
    if (lo === undefined) return Math.random();
    if (hi === undefined) return Math.random() * expectNumber(lo, "random max");
    const loN = expectNumber(lo, "random lo");
    const hiN = expectNumber(hi, "random hi");
    return loN + Math.random() * (hiN - loN);
  });


  // ── Type conversion ─────────────────────────────────────────────────────────

  // str(x) — convert any value to a string, e.g.  str(42)  → "42"
  env.define("str", (x: unknown) => String(x));

  // num(x) — convert a string to a number, e.g.  num("3.14")  → 3.14
  // Throws if the conversion fails (e.g.  num("hello")).
  env.define("num", (x: unknown) => {
    const n = Number(x);
    if (isNaN(n)) throw new Error(`Cannot convert '${x}' to a number.`);
    return n;
  });


  // ── Graphics ────────────────────────────────────────────────────────────────
  // These all require the graphics API to be available — it's injected by the
  // web IDE when running in the browser. They throw if called from the CLI.

  // clear() — wipe the canvas and redraw the background. Call this at the start of every frame.
  env.define("clear", () => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    config.graphics.clear();
    return null;
  });

  // rect(x, y, width, height) — draw a filled rectangle.
  env.define("rect", (x: unknown, y: unknown, w: unknown, h: unknown) => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    config.graphics.rect(
      expectNumber(x, "rect x"),
      expectNumber(y, "rect y"),
      expectNumber(w, "rect width"),
      expectNumber(h, "rect height")
    );
    return null;
  });

  // circle(x, y, radius) — draw a filled circle centered at (x, y).
  env.define("circle", (x: unknown, y: unknown, r: unknown) => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    config.graphics.circle(
      expectNumber(x, "circle x"),
      expectNumber(y, "circle y"),
      expectNumber(r, "circle radius")
    );
    return null;
  });

  // fillColor(color) — set the color used by rect() and circle() going forward.
  // Accepts any CSS color string, e.g. "#ff0000", "red", "rgba(0,255,0,0.5)".
  env.define("fillColor", (color: unknown) => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    config.graphics.fillColor(expectString(color, "fillColor"));
    return null;
  });

  // canvasWidth() / canvasHeight() — return the size of the game canvas in pixels.
  // Useful for keeping things inside the screen:  if (x > canvasWidth()) { ... }
  env.define("canvasWidth",  () => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    return config.graphics.width();
  });
  env.define("canvasHeight", () => {
    if (!config.graphics) throw new Error("Graphics API is not available.");
    return config.graphics.height();
  });


  // ── Game loop ────────────────────────────────────────────────────────────────
  // onUpdate(fn) — register a function to be called every animation frame (~60fps).
  // This is how you make animated or interactive Dirt programs.
  //
  // Usage pattern:
  //   fn update() {
  //     clear();
  //     circle(x, y, 20);
  //   }
  //   onUpdate(update);   // call this once at the bottom of your program
  //
  // The web IDE's main.ts drives the actual requestAnimationFrame loop and calls
  // this registered function on every frame.
  env.define("onUpdate", (fn: unknown) => {
    if (!config.onUpdate) {
      throw new Error("onUpdate is only available in the web IDE.");
    }
    if (
      typeof fn !== "function" &&
      !(typeof fn === "object" && fn !== null && (fn as any).kind === "DirtFunction")
    ) {
      throw new Error("onUpdate expects a function.");
    }
    config.onUpdate(fn as any);
    return null;
  });


  // ── Input ────────────────────────────────────────────────────────────────────
  // keyDown(key) — returns true if the given key is currently held down.
  // Key names match the browser's KeyboardEvent.key values:
  //   "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " " (space), "a", "Enter", etc.
  // Returns false silently if no input API is available .
  env.define("keyDown", (key: unknown) => {
    if (!config.input) return false;
    return config.input.keyDown(expectString(key, "keyDown"));
  });
}