// runProgram.ts
// The entry point for actually running a Dirt program.
//
// This file owns two things:
//   1. The type definitions that describe what the host environment (CLI or web IDE)
//      must provide — graphics, input, the game loop hook.
//   2. Two functions: runProgram() for normal execution, and runProgramDebug()
//      which also captures output, tokens, AST, and environment for the IDE panels.
//
// Both functions run the same pipeline:  source → lex → parse → interpret

import { lex }              from "../lexer/lexer.js";
import { parse }            from "../parser/parser.js";
import { Environment }      from "./environment.js";
import { registerBuiltins } from "../stdlib/builtins.js";
import { Interpreter }      from "./interpreter.js";


// What the host must provide for Dirt's drawing functions to work.
// The web IDE creates a canvas and passes these implementations in.
// The CLI doesn't pass a graphics object — calling draw functions from
// the CLI will throw a clear error.
export type DirtGraphicsAPI = {
  clear:     () => void;
  rect:      (x: number, y: number, width: number, height: number) => void;
  circle:    (x: number, y: number, radius: number) => void;
  fillColor: (color: string) => void;
  width:     () => number;
  height:    () => number;
};

// What the host must provide for Dirt's keyboard input functions to work.
// The web IDE tracks held keys and passes this in. CLI returns false for everything.
export type DirtInputAPI = {
  keyDown: (key: string) => boolean;
};

// A function value that can be registered with onUpdate().
// It might be a native JS function or a user-defined DirtFunction object.
export type DirtCallable =
  | ((...args: unknown[]) => unknown)
  | { kind: "DirtFunction"; [k: string]: unknown };

// Everything the host can inject into a Dirt program's runtime.
// All fields are optional — only provide what the current context supports.
export type DirtConfig = {
  sourcePath?: string;          // path to the source file (used in error messages)
  graphics?:   DirtGraphicsAPI; // canvas drawing API — only provided by the web IDE
  input?:      DirtInputAPI;    // keyboard state API — only provided by the web IDE
  onUpdate?:   (fn: DirtCallable) => void; // called when a Dirt program registers a game loop function
};


// Run a Dirt program from source text.
// Used by the CLI (main.ts) where we just want to execute and don't need debug info.
export function runProgram(source: string, config: DirtConfig) {
  const tokens = lex(source);
  const program = parse(tokens);

  const globalEnv = new Environment();
  registerBuiltins(globalEnv, config); // inject print, circle, etc. before running

  const interpreter = new Interpreter(globalEnv, config);
  interpreter.executeProgram(program);
}


// Run a Dirt program AND return rich debug information about what happened.
// Used by the web IDE so it can display output, tokens, the AST, and the final
// environment state in the sidebar panels.
//
// We temporarily replace console.log so that print() calls in the Dirt program
// get captured into the "output" array instead of going to the browser console.
export function runProgramDebug(source: string, config: DirtConfig) {
  const output: string[] = [];

  // Intercept console.log so print() output is captured for the IDE output panel.
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    output.push(args.map((a) => String(a)).join(" "));
  };

  try {
    const tokens  = lex(source);
    const program = parse(tokens);

    const globalEnv = new Environment();
    registerBuiltins(globalEnv, config);

    const interpreter = new Interpreter(globalEnv, config);
    interpreter.executeProgram(program);

    // Return everything the IDE needs for its debug panels.
    return {
      ok:     true as const,
      output,          // lines printed by print()
      tokens,          // token list for the Tokens tab
      ast:    program, // full AST for the AST tab
      env:    globalEnv.dump(), // final global variable state for the Env tab
    };
  } catch (e) {
    // If anything went wrong (syntax error, runtime error), return the error
    // alongside whatever output was produced before the crash.
    return {
      ok:     false as const,
      output,
      error:  e instanceof Error ? e.message : String(e),
    };
  } finally {
    // Always restore the real console.log, even if an error was thrown.
    console.log = originalLog;
  }
}