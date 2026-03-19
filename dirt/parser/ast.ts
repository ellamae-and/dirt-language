export type Program = { kind: "Program"; statements: Stmt[] };

export type Stmt =
  | { kind: "ExprStmt"; expr: Expr }
  | { kind: "VarDecl"; name: string; initializer: Expr };

export type Expr =
  | { kind: "Number"; value: number }
  | { kind: "String"; value: string }
  | { kind: "Variable"; name: string }
  | { kind: "Binary"; op: "+" | "-" | "*" | "/"; left: Expr; right: Expr }
  | { kind: "Call"; callee: string; args: Expr[] };