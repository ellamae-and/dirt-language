export class Interpreter {
    env;
    _config;
    constructor(env, _config) {
        this.env = env;
        this._config = _config;
    }
    executeProgram(program) {
        for (const stmt of program.statements)
            this.execute(stmt);
    }
    execute(stmt) {
        if (stmt.kind === "ExprStmt") {
            this.evaluate(stmt.expr);
        }
    }
    evaluate(expr) {
        switch (expr.kind) {
            case "Number":
                return expr.value;
            case "Binary": {
                const left = this.evaluate(expr.left);
                const right = this.evaluate(expr.right);
                if (typeof left !== "number" || typeof right !== "number") {
                    throw new Error("Binary operators require numbers.");
                }
                switch (expr.op) {
                    case "+": return left + right;
                    case "-": return left - right;
                    case "*": return left * right;
                    case "/":
                        if (right === 0)
                            throw new Error("Division by zero.");
                        return left / right;
                }
            }
            case "Call": {
                const fn = this.env.get(expr.callee);
                if (typeof fn !== "function") {
                    throw new Error(`'${expr.callee}' is not callable.`);
                }
                const args = expr.args.map(a => this.evaluate(a));
                return fn(...args);
            }
        }
    }
}
