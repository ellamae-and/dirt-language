// ast.ts
// Defines the shape of the Abstract Syntax Tree (AST).
//
// After tokenizing, the parser reads the token list and builds a TREE that
// represents the structure of the program. Instead of a flat list of words,
// we now have a nested structure that captures things like:
// "this is an if-statement, and inside it is a while-loop, and inside that
// is a function call with two arguments".
//
// The interpreter then walks this tree and executes each node.
//
// Every node has a "kind" field. TypeScript uses that to know exactly which
// shape each node has, so we get type-safe access to the right fields in
// every switch/case block.

// The root of every program — just a list of statements to run in order.
export type Program = { kind: "Program"; statements: Stmt[] };

// A statement does something but doesn't produce a value.
// Running a statement causes an effect: declaring a variable, looping, etc.
export type Stmt =

  // A bare expression used as a statement, e.g.  print("hi");
  // The expression's return value is thrown away.
  | { kind: "ExprStmt"; expr: Expr }

  // Declaring a new variable with let, e.g.  let x = 5;
  | { kind: "VarDecl"; name: string; initializer: Expr }

  // Reassigning a variable that already exists, e.g.  x = x + 1;
  // This is different from VarDecl — it walks up the scope chain to find
  // where x was originally declared and updates it there.
  | { kind: "Assign"; name: string; value: Expr }

  // A { } block — a group of statements that share their own scope.
  // Variables declared inside a block disappear when the block ends.
  | { kind: "Block"; statements: Stmt[] }

  // An if/else — runs "then" if the condition is truthy, "else" otherwise.
  // The else branch is optional.
  | { kind: "If"; condition: Expr; then: Stmt; else?: Stmt }

  // A while loop — keeps running "body" as long as "condition" stays truthy.
  | { kind: "While"; condition: Expr; body: Stmt }

  // Declaring a named function, e.g.  fn add(a, b) { return a + b; }
  // The function is stored as a value in the current scope so it can be called later.
  // It captures ("closes over") the environment it was defined in.
  | { kind: "FnDecl"; name: string; params: string[]; body: Stmt }

  // Exiting a function early and optionally sending back a value.
  // If no value is given, the function returns null.
  | { kind: "Return"; value?: Expr };


// An expression produces a value when evaluated.
// Expressions appear inside statements — as conditions, arguments, right-hand sides, etc.
export type Expr =

  // A raw number literal, e.g. 42 or 3.14
  | { kind: "Number"; value: number }

  // A raw string literal, e.g. "hello"
  | { kind: "String"; value: string }

  // A raw boolean literal — true or false
  | { kind: "Boolean"; value: boolean }

  // Reading the current value of a variable by name, e.g. x or score
  | { kind: "Variable"; name: string }

  // A ! operator applied to one expression, e.g.  !isAlive
  // Negative numbers (-x) are handled by the parser as (0 - x) instead of
  // adding a separate Unary("-") case.
  | { kind: "Unary"; op: "!"; operand: Expr }

  // Two expressions combined with an operator, e.g.  x + 3  or  score >= 100
  // The op field is locked to only the operators Dirt actually supports.
  | { kind: "Binary";
      op: "+" | "-" | "*" | "/" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "&&" | "||";
      left: Expr; right: Expr }

  // Calling a function by name with a list of argument expressions.
  // e.g.  add(x, 3)  or  circle(x, y, 20)
  | { kind: "Call"; callee: string; args: Expr[] };