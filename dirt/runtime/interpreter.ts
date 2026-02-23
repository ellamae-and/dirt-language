import { Program, Stmt, Expr } from "../parser/ast.js";
import { Environment } from "./environment.js";
import type { DirtConfig } from "./runProgram.js";

export class Interpreter {


  // the interpreter needs an environment and config object 
  constructor(private env: Environment, private _config: DirtConfig) {}

  // runs the program/statements
  executeProgram(program: Program) {
    for (const stmt of program.statements) this.execute(stmt);
  }


  // execute a single statement
  private execute(stmt: Stmt) {

    // right now, the only kind of statement we support is an expression statement
    if (stmt.kind === "ExprStmt") {
      this.evaluate(stmt.expr);
    }
  }


  // evaluate an expression and return its value
  private evaluate(expr: Expr): unknown {
    switch (expr.kind) {

      // if the expression is just a number return its value.
      case "Number":
        return expr.value;

      // if it's a binary operation like 1 + 2, evaluate both sides and apply the operator
      case "Binary": {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);

        // make sure both sides are numbers
        if (typeof left !== "number" || typeof right !== "number") {
          throw new Error("Binary operators require numbers.");
        }

        // apply the correct math operation
        switch (expr.op) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/":
            if (right === 0) throw new Error("Division by zero.");
            return left / right;
        }
      }

      // if it's a function call like print(5), look up the function in the environment
      case "Call": {
        
        // get function by name
        const fn = this.env.get(expr.callee);

        // make sure it's actually callable
        if (typeof fn !== "function") {
          throw new Error(`'${expr.callee}' is not callable.`);
        }

        // evaulate each argument before passing it in
        const args = expr.args.map(a => this.evaluate(a));

        // call the function
        return (fn as (...xs: unknown[]) => unknown)(...args);
      }
    }
  }
}