// interpreter.ts
// Walks the AST and executes the program.
//
// The interpreter is a "tree-walk" interpreter — it visits each node in the AST,
// decides what to do based on the node's kind, and either runs a side effect
// (printing, drawing, assigning a variable) or computes and returns a value.
//
// RETURN VALUES AS EXCEPTIONS
// When a Dirt function hits a "return" statement, we need to immediately stop
// executing the function body and send the value back to the call site — potentially
// jumping out of deeply nested loops and blocks. The cleanest way to do this in a
// tree-walk interpreter is to throw a special object (ReturnSignal) and catch it
// in the function call handler. It's not an error — it's just using JS's exception
// mechanism as a control-flow tool.

import { Program, Stmt, Expr } from "../parser/ast.js";
import { Environment } from "./environment.js";
import type { DirtConfig } from "./runProgram.js";


// Thrown by a "return" statement and caught inside the Call handler.
// Carries the return value so it can be handed back to the caller.
class ReturnSignal {
  constructor(public readonly value: unknown) {}
}


// Represents a user-defined Dirt function stored as a first-class value.
// When the program runs  fn add(a, b) { return a + b; }  we create one of these
// and store it in the environment under the name "add".
// The "closure" field is the environment that existed when the function was DEFINED —
// this is what lets inner functions access variables from their outer scope.
type DirtFunction = {
  kind:    "DirtFunction";
  params:  string[];
  body:    Stmt;
  closure: Environment;
};


// Determines whether a value should be treated as "true" in a condition.
// Dirt follows common-sense rules: null, false, 0, and "" are falsy; everything else is truthy.
function isTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")  return value !== 0;
  if (typeof value === "string")  return value.length > 0;
  return true;
}


export class Interpreter {

  // env is the global environment — all builtins (print, circle, etc.) live here,
  // and top-level variables get added here as the program runs.
  constructor(private env: Environment, private _config: DirtConfig) {}


  // Run the entire program from top to bottom.
  executeProgram(program: Program) {
    for (const stmt of program.statements) this.execute(stmt);
  }


  // Execute one statement. Takes an optional env argument so blocks and function
  // calls can pass in their own local scope instead of using the global one.
  execute(stmt: Stmt, env: Environment = this.env): void {
    switch (stmt.kind) {

      // A bare expression used as a statement — evaluate it and discard the result.
      // e.g.  print("hi");  — we call print for its side effect, not its return value.
      case "ExprStmt":
        this.evaluate(stmt.expr, env);
        return;

      // let x = expr;  — evaluate the right-hand side and store it as a new variable.
      case "VarDecl": {
        const value = this.evaluate(stmt.initializer, env);
        env.define(stmt.name, value);
        return;
      }

      // x = expr;  — find the existing variable (wherever it was declared) and update it.
      case "Assign": {
        const value = this.evaluate(stmt.value, env);
        env.set(stmt.name, value);
        return;
      }

      // { ... }  — run the statements inside their own fresh scope.
      // Variables declared inside the block are discarded when it ends.
      case "Block": {
        const blockEnv = new Environment(env); // child scope, parent is current scope
        for (const s of stmt.statements) this.execute(s, blockEnv);
        return;
      }

      // if (condition) { ... } else { ... }
      // Evaluate the condition; run the appropriate branch.
      case "If": {
        if (isTruthy(this.evaluate(stmt.condition, env))) {
          this.execute(stmt.then, env);
        } else if (stmt.else) {
          this.execute(stmt.else, env);
        }
        return;
      }

      // while (condition) { ... }
      // Re-evaluate the condition before every iteration. Stop as soon as it's falsy.
      case "While": {
        while (isTruthy(this.evaluate(stmt.condition, env))) {
          this.execute(stmt.body, env);
        }
        return;
      }

      // fn name(params) { body }
      // Package the function up as a DirtFunction value and store it in the current scope.
      // We capture "env" as the closure so the function remembers the scope it was defined in.
      case "FnDecl": {
        const fn: DirtFunction = {
          kind:    "DirtFunction",
          params:  stmt.params,
          body:    stmt.body,
          closure: env,
        };
        env.define(stmt.name, fn);
        return;
      }

      // return expr;  — evaluate the value and throw it as a ReturnSignal.
      // The Call handler below will catch it and use the value.
      case "Return": {
        const value = stmt.value ? this.evaluate(stmt.value, env) : null;
        throw new ReturnSignal(value);
      }
    }
  }


  // Evaluate one expression and return its value.
  // Takes an optional env so function calls can evaluate in their own local scope.
  evaluate(expr: Expr, env: Environment = this.env): unknown {
    switch (expr.kind) {

      // Literal values — just return what the parser already extracted.
      case "Number":  return expr.value;
      case "String":  return expr.value;
      case "Boolean": return expr.value;

      // Variable read — look up the name in the scope chain.
      case "Variable":
        return env.get(expr.name);

      // ! operator — invert the truthiness of the operand.
      // op is typed as the literal "!" so no need to check — it can only ever be !.
      case "Unary": {
        const operand = this.evaluate(expr.operand, env);
        return !isTruthy(operand);
      }

      case "Binary": {
        // && and || short-circuit — we only evaluate the right side if necessary.
        // For &&: if the left is falsy, the result is already false — skip the right.
        // For ||: if the left is truthy, the result is already true — skip the right.
        if (expr.op === "&&") {
          const left = this.evaluate(expr.left, env);
          return isTruthy(left) ? this.evaluate(expr.right, env) : left;
        }
        if (expr.op === "||") {
          const left = this.evaluate(expr.left, env);
          return isTruthy(left) ? left : this.evaluate(expr.right, env);
        }

        // All other binary operators evaluate both sides before applying the operation.
        const left  = this.evaluate(expr.left, env);
        const right = this.evaluate(expr.right, env);

        switch (expr.op) {
          case "+":
            // + works on both numbers (addition) and strings (concatenation).
            // If either side is a string, both sides are converted to strings and joined.
            if (typeof left === "number" && typeof right === "number") return left + right;
            if (typeof left === "string" || typeof right === "string") return String(left) + String(right);
            throw new Error("Operator '+' requires numbers or strings.");
          case "-":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '-' requires numbers.");
            return (left as number) - (right as number);
          case "*":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '*' requires numbers.");
            return (left as number) * (right as number);
          case "/":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '/' requires numbers.");
            if (right === 0) throw new Error("Division by zero.");
            return (left as number) / (right as number);
          case "==": return left === right;
          case "!=": return left !== right;
          case "<":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '<' requires numbers.");
            return (left as number) < (right as number);
          case "<=":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '<=' requires numbers.");
            return (left as number) <= (right as number);
          case ">":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '>' requires numbers.");
            return (left as number) > (right as number);
          case ">=":
            if (typeof left !== "number" || typeof right !== "number") throw new Error("Operator '>=' requires numbers.");
            return (left as number) >= (right as number);
          default:
            // This can't happen — every op in the Binary AST node is handled above.
            // The throw exists so TypeScript knows this branch always exits.
            throw new Error(`Unknown operator.`);
        }
      }

      case "Call": {
        // Look up what the callee name refers to in the environment.
        const callee = env.get(expr.callee);
        // Evaluate every argument expression left-to-right before calling.
        const args   = expr.args.map(a => this.evaluate(a, env));

        // Case 1: a native JS function (one of the builtins registered in builtins.ts).
        if (typeof callee === "function") {
          return (callee as (...xs: unknown[]) => unknown)(...args);
        }

        // Case 2: a user-defined Dirt function (stored as a DirtFunction object).
        if (
          typeof callee === "object" && callee !== null &&
          (callee as DirtFunction).kind === "DirtFunction"
        ) {
          const fn = callee as DirtFunction;

          if (args.length !== fn.params.length) {
            throw new Error(
              `'${expr.callee}' expects ${fn.params.length} argument(s) but got ${args.length}.`
            );
          }

          // Create a fresh local scope for this call, parented to the CLOSURE
          // (where the function was defined), not the current call site.
          // This is what makes closures work — inner functions always see the scope
          // they were born in, no matter where they're called from.
          const callEnv = new Environment(fn.closure);
          fn.params.forEach((p, idx) => callEnv.define(p, args[idx]));

          try {
            this.execute(fn.body, callEnv);
            return null; // if execution falls off the end of the function, return null
          } catch (signal) {
            // A ReturnSignal means the function hit a "return" statement.
            // Extract the value and return it normally.
            if (signal instanceof ReturnSignal) return signal.value;
            throw signal; // anything else is a genuine error — rethrow it
          }
        }

        throw new Error(`'${expr.callee}' is not callable.`);
      }
    }
    throw new Error(`Unhandled expression kind.`);
  }
}