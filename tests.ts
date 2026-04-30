// tests.ts
// Minimal unit tests for the Dirt programming language.
// Covers: Lexer, Parser, Interpreter, Environment, Builtins
//
// Run with:  npx tsx tests.ts

import assert from "node:assert";
import { lex } from "./dirt/lexer/lexer.js";
import { TokenType } from "./dirt/lexer/token.js";
import { parse } from "./dirt/parser/parser.js";
import { Environment } from "./dirt/runtime/environment.js";
import { registerBuiltins } from "./dirt/stdlib/builtins.js";
import { Interpreter } from "./dirt/runtime/interpreter.js";
import type { DirtConfig } from "./dirt/runtime/runProgram.js";

let passed = 0;
let failed = 0;

// ── Tiny test runner ─────────────────────────────────────────────────────────
function test(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✕ ${name}`);
    console.log(`    ${e instanceof Error ? e.message : e}`);
  }
}

// ── Helper: run Dirt code and capture print() output ─────────────────────────
function run(source: string): { output: string[]; env: Environment } {
  const output: string[] = [];
  const origLog = console.log;
  console.log = (...args: unknown[]) => output.push(args.map(String).join(" "));

  const tokens  = lex(source);
  const program = parse(tokens);
  const env     = new Environment();
  const config: DirtConfig = {};
  registerBuiltins(env, config);
  const interp = new Interpreter(env, config);

  try { interp.executeProgram(program); }
  finally { console.log = origLog; }

  return { output, env };
}

// ── Helper: expect a throw matching a pattern ────────────────────────────────
function throws(fn: () => void, pattern: RegExp) {
  try { fn(); assert.fail("Expected an error but none was thrown"); }
  catch (e: any) {
    if (e?.code === "ERR_ASSERTION") throw e;
    assert.match(String(e), pattern);
  }
}


// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── Lexer ──────────────────────────────────────────────");

test("tokenizes single-char punctuation", () => {
  const types = lex("( ) { } ; ,").filter(t => t.type !== TokenType.EOF).map(t => t.type);
  assert.deepStrictEqual(types, [
    TokenType.LeftParen, TokenType.RightParen,
    TokenType.LeftBrace, TokenType.RightBrace,
    TokenType.Semicolon, TokenType.Comma,
  ]);
});

test("tokenizes numbers with correct literal value", () => {
  const t = lex("3.14")[0];
  assert.strictEqual(t.type, TokenType.Number);
  assert.strictEqual(t.literal, 3.14);
});

test("tokenizes strings and handles escape sequences", () => {
  const t = lex('"he\\nllo"')[0];
  assert.strictEqual(t.literal, "he\nllo");
});

test("recognizes keywords vs identifiers", () => {
  const types = lex("let x if letter").filter(t => t.type !== TokenType.EOF).map(t => t.type);
  assert.deepStrictEqual(types, [
    TokenType.Let, TokenType.Identifier, TokenType.If, TokenType.Identifier,
  ]);
});

test("distinguishes = from ==", () => {
  const types = lex("= ==").filter(t => t.type !== TokenType.EOF).map(t => t.type);
  assert.deepStrictEqual(types, [TokenType.Equal, TokenType.EqualEqual]);
});

test("skips comments", () => {
  const nums = lex("1 // skip\n2").filter(t => t.type === TokenType.Number);
  assert.strictEqual(nums.length, 2);
});

test("throws on unexpected character", () => {
  throws(() => lex("@"), /Unexpected character/);
});

test("throws on unterminated string", () => {
  throws(() => lex('"oops'), /Unterminated string/);
});

test("always ends with EOF", () => {
  const tokens = lex("");
  assert.strictEqual(tokens.length, 1);
  assert.strictEqual(tokens[0].type, TokenType.EOF);
});


// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── Parser ─────────────────────────────────────────────");

test("parses let declaration", () => {
  const stmt = parse(lex("let x = 5;")).statements[0];
  assert.strictEqual(stmt.kind, "VarDecl");
  if (stmt.kind === "VarDecl") assert.strictEqual(stmt.name, "x");
});

test("parses binary expression with correct precedence", () => {
  const stmt = parse(lex("1 + 2 * 3;")).statements[0];
  if (stmt.kind === "ExprStmt" && stmt.expr.kind === "Binary") {
    assert.strictEqual(stmt.expr.op, "+");
  }
});

test("parses function declaration", () => {
  const stmt = parse(lex("fn add(a, b) { return a + b; }")).statements[0];
  assert.strictEqual(stmt.kind, "FnDecl");
  if (stmt.kind === "FnDecl") assert.deepStrictEqual(stmt.params, ["a", "b"]);
});

test("parses if/else", () => {
  const stmt = parse(lex("if (true) { x = 1; } else { x = 2; }")).statements[0];
  assert.strictEqual(stmt.kind, "If");
  if (stmt.kind === "If") assert.ok(stmt.else);
});

test("parses while loop", () => {
  const stmt = parse(lex("while (x > 0) { x = x - 1; }")).statements[0];
  assert.strictEqual(stmt.kind, "While");
});

test("throws on missing semicolon", () => {
  throws(() => parse(lex("let x = 5")), /Expected ';'/);
});


// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── Environment ────────────────────────────────────────");

test("define and get a variable", () => {
  const env = new Environment();
  env.define("x", 42);
  assert.strictEqual(env.get("x"), 42);
});

test("parent scope lookup", () => {
  const parent = new Environment();
  parent.define("x", 10);
  const child = new Environment(parent);
  assert.strictEqual(child.get("x"), 10);
});

test("set updates variable in defining scope", () => {
  const parent = new Environment();
  parent.define("x", 1);
  const child = new Environment(parent);
  child.set("x", 99);
  assert.strictEqual(parent.get("x"), 99);
});

test("throws on undefined variable", () => {
  const env = new Environment();
  throws(() => env.get("nope"), /Undefined variable/);
});

test("dump returns only current scope", () => {
  const parent = new Environment();
  parent.define("a", 1);
  const child = new Environment(parent);
  child.define("b", 2);
  assert.deepStrictEqual(child.dump(), { b: 2 });
});


// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── Interpreter ────────────────────────────────────────");

test("prints a value", () => {
  assert.deepStrictEqual(run('print("hi");').output, ["hi"]);
});

test("arithmetic", () => {
  assert.deepStrictEqual(run("print(2 + 3 * 4);").output, ["14"]);
});

test("string concatenation", () => {
  assert.deepStrictEqual(run('print("a" + "b");').output, ["ab"]);
});

test("variables and reassignment", () => {
  assert.deepStrictEqual(run("let x = 1; x = 2; print(x);").output, ["2"]);
});

test("if/else takes correct branch", () => {
  assert.deepStrictEqual(
    run('if (false) { print("a"); } else { print("b"); }').output, ["b"]
  );
});

test("while loop", () => {
  assert.deepStrictEqual(
    run("let i = 0; while (i < 3) { print(i); i = i + 1; }").output,
    ["0", "1", "2"]
  );
});

test("function call with return value", () => {
  assert.deepStrictEqual(
    run("fn add(a,b) { return a+b; } print(add(3,4));").output, ["7"]
  );
});

test("closure captures defining scope", () => {
  const src = `
    fn counter() {
      let n = 0;
      fn inc() { n = n + 1; return n; }
      return inc;
    }
    let c = counter();
    print(c());
    print(c());
  `;
  assert.deepStrictEqual(run(src).output, ["1", "2"]);
});

test("block scoping — inner var not visible outside", () => {
  throws(() => run("{ let x = 1; } print(x);"), /Undefined variable/);
});

test("division by zero throws", () => {
  throws(() => run("print(1/0);"), /Division by zero/);
});

test("calling a non-function throws", () => {
  throws(() => run("let x = 5; x();"), /not callable/);
});


// ═════════════════════════════════════════════════════════════════════════════
console.log("\n── Builtins ───────────────────────────────────────────");

test("abs, floor, mod", () => {
  assert.deepStrictEqual(
    run("print(abs(-7)); print(floor(3.9)); print(mod(10,3));").output,
    ["7", "3", "1"]
  );
});

test("min and max", () => {
  assert.deepStrictEqual(
    run("print(min(5,2)); print(max(5,2));").output, ["2", "5"]
  );
});

test("str and num conversion", () => {
  assert.deepStrictEqual(
    run('print(str(42)); print(num("7") + 1);').output, ["42", "8"]
  );
});

test("type guard throws on wrong type", () => {
  throws(() => run('print(abs("x"));'), /must be a number/);
});

test("graphics builtins throw without graphics API", () => {
  throws(() => run("clear();"), /Graphics API is not available/);
});


// ═════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(55)}`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
if (failed > 0) process.exit(1);