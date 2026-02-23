
// root of the AST
export type Program = { kind: "Program"; statements: Stmt[] };

// represents one complete instruction
// right now that is only an expression followed by semi colon
export type Stmt =
  | { kind: "ExprStmt"; expr: Expr };

// Expr represents something that produces a value
export type Expr =
  | { kind: "Number"; value: number }
  | { kind: "Binary"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "Call"; callee: string; args: Expr[] };


