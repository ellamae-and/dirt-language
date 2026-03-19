import { Program, Stmt, Expr } from "../parser/ast.js";
import { Environment } from "./environment.js";
import type { DirtConfig } from "./runProgram.js";

export class Interpreter {
  constructor(private env: Environment, private _config: DirtConfig) {}

  executeProgram(program: Program) {
    for (const stmt of program.statements) this.execute(stmt);
  }

  private execute(stmt: Stmt) {
    switch (stmt.kind) {
      case "ExprStmt":
        this.evaluate(stmt.expr);
        return;

      case "VarDecl": {
        const value = this.evaluate(stmt.initializer);
        this.env.define(stmt.name, value);
        return;
      }
    }
  }

  private evaluate(expr: Expr): unknown {
    switch (expr.kind) {
      case "Number":
        return expr.value;

      case "String":
        return expr.value;

      case "Variable":
        return this.env.get(expr.name);

      case "Binary": {
        const left = this.evaluate(expr.left);
        const right = this.evaluate(expr.right);

        switch (expr.op) {
          case "+":
            // number + number
            if (typeof left === "number" && typeof right === "number") {
              return left + right;
            }

            // string concatenation
            if (typeof left === "string" || typeof right === "string") {
              return String(left) + String(right);
            }

            throw new Error("Operator '+' requires numbers or strings.");

          case "-":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error("Operator '-' requires numbers.");
            }
            return left - right;

          case "*":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error("Operator '*' requires numbers.");
            }
            return left * right;

          case "/":
            if (typeof left !== "number" || typeof right !== "number") {
              throw new Error("Operator '/' requires numbers.");
            }
            if (right === 0) throw new Error("Division by zero.");
            return left / right;
        }
      }

      case "Call": {
        const fn = this.env.get(expr.callee);

        if (typeof fn !== "function") {
          throw new Error(`'${expr.callee}' is not callable.`);
        }

        const args = expr.args.map(a => this.evaluate(a));
        return (fn as (...xs: unknown[]) => unknown)(...args);
      }
    }
  }
}