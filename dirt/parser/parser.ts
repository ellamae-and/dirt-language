// parser.ts
// Reads the token list and builds the Abstract Syntax Tree (AST).
//
// The parser understands GRAMMAR — the rules for what makes a valid Dirt program.
// It knows things like "an if-statement must have a condition in parentheses,
// followed by a body, optionally followed by 'else' and another body."
//
// It works by reading tokens one at a time with a cursor, matching expected
// patterns, and assembling AST nodes. If the tokens don't match the expected
// pattern, it throws a descriptive error.
//
// PRECEDENCE
// Operator precedence (which operations bind tighter) is handled by the
// structure of the parsing functions themselves. Each function in the
// "expression" chain only calls functions of HIGHER precedence, so the
// tree naturally comes out with the right grouping:
//
//   or → and → equality → comparison → addition → multiplication → unary → call → primary
//
// Lower in the chain = binds tighter. So  3 + 4 * 2  correctly parses as  3 + (4 * 2).

import { Token, TokenType } from "../lexer/token.js";
import { Expr, Program, Stmt } from "./ast.js";


export function parse(tokens: Token[]): Program {

  let current = 0; // index of the token we're currently looking at

  // Look at the current token without consuming it.
  const peek     = () => tokens[current];
  // Get the token we just consumed (one step back).
  const previous = () => tokens[current - 1];
  // True when we've reached the end-of-file sentinel.
  const isAtEnd  = () => peek().type === TokenType.EOF;

  // Move the cursor forward and return the token we just passed.
  const advance = () => {
    if (!isAtEnd()) current++;
    return previous();
  };

  // True if the current token is of the given type (without consuming it).
  const check = (type: TokenType) => !isAtEnd() && peek().type === type;

  // If the current token matches any of the given types, consume it and return true.
  // Otherwise do nothing and return false.
  const match = (...types: TokenType[]) => {
    for (const t of types) {
      if (check(t)) { advance(); return true; }
    }
    return false;
  };

  // Consume the current token if it matches the expected type.
  // If it doesn't match, throw a helpful error — the program has a syntax error.
  const consume = (type: TokenType, msg: string) => {
    if (check(type)) return advance();
    throw new Error(`${msg} (got '${peek().lexeme}' at index ${peek().index})`);
  };


  // ===========================================================================
  // STATEMENTS
  // Each function here handles one kind of statement by consuming the tokens
  // that form it and returning the appropriate AST node.
  // ===========================================================================

  // The top level — collect all statements until we hit the end of the file.
  function program(): Program {
    const statements: Stmt[] = [];
    while (!isAtEnd()) statements.push(statement());
    return { kind: "Program", statements };
  }

  // Decide which kind of statement we're looking at based on the current token.
  function statement(): Stmt {
    if (match(TokenType.Fn))          return fnDeclaration();
    if (match(TokenType.Let))         return varDeclaration();
    if (match(TokenType.Return))      return returnStatement();
    if (match(TokenType.If))          return ifStatement();
    if (match(TokenType.While))       return whileStatement();
    if (check(TokenType.LeftBrace))   return block();
    return expressionStatement();
  }

  // fn name(param1, param2) { body }
  // We've already consumed the "fn" keyword before arriving here.
  function fnDeclaration(): Stmt {
    const name = consume(TokenType.Identifier, "Expected function name after 'fn'.").lexeme;
    consume(TokenType.LeftParen, "Expected '(' after function name.");

    // Collect zero or more comma-separated parameter names.
    const params: string[] = [];
    if (!check(TokenType.RightParen)) {
      params.push(consume(TokenType.Identifier, "Expected parameter name.").lexeme);
      while (match(TokenType.Comma)) {
        params.push(consume(TokenType.Identifier, "Expected parameter name.").lexeme);
      }
    }
    consume(TokenType.RightParen, "Expected ')' after parameters.");

    const body = block(); // function body is always a { } block
    return { kind: "FnDecl", name, params, body };
  }

  // let name = expression;
  // We've already consumed "let" before arriving here.
  function varDeclaration(): Stmt {
    const name = consume(TokenType.Identifier, "Expected variable name.").lexeme;
    consume(TokenType.Equal, "Expected '=' after variable name.");
    const initializer = expression();
    consume(TokenType.Semicolon, "Expected ';' after variable declaration.");
    return { kind: "VarDecl", name, initializer };
  }

  // return;  OR  return expression;
  // We've already consumed "return" before arriving here.
  function returnStatement(): Stmt {
    if (match(TokenType.Semicolon)) return { kind: "Return" }; // bare return
    const value = expression();
    consume(TokenType.Semicolon, "Expected ';' after return value.");
    return { kind: "Return", value };
  }

  // if (condition) statement  OR  if (condition) statement else statement
  // We've already consumed "if" before arriving here.
  function ifStatement(): Stmt {
    consume(TokenType.LeftParen, "Expected '(' after 'if'.");
    const condition = expression();
    consume(TokenType.RightParen, "Expected ')' after condition.");

    const thenBranch = statement();

    // The else branch is optional — only consume it if "else" is actually there.
    let elseBranch: Stmt | undefined;
    if (match(TokenType.Else)) {
      elseBranch = statement();
    }

    return { kind: "If", condition, then: thenBranch, else: elseBranch };
  }

  // while (condition) statement
  // We've already consumed "while" before arriving here.
  function whileStatement(): Stmt {
    consume(TokenType.LeftParen, "Expected '(' after 'while'.");
    const condition = expression();
    consume(TokenType.RightParen, "Expected ')' after condition.");
    const body = statement();
    return { kind: "While", condition, body };
  }

  // { statement1; statement2; ... }
  // Creates a new block node. The interpreter will give this block its own scope.
  function block(): Stmt {
    consume(TokenType.LeftBrace, "Expected '{'.");
    const statements: Stmt[] = [];
    while (!check(TokenType.RightBrace) && !isAtEnd()) {
      statements.push(statement());
    }
    consume(TokenType.RightBrace, "Expected '}'.");
    return { kind: "Block", statements };
  }

  // Any statement that starts with an expression.
  // We check for assignment first (x = expr;) because it starts with an identifier
  // followed by "=" — we need to catch that before the expression parser tries to
  // read x as a variable reference and then gets confused by the "=".
  function expressionStatement(): Stmt {
    if (
      check(TokenType.Identifier) &&
      tokens[current + 1]?.type === TokenType.Equal
    ) {
      const name = advance().lexeme; // consume the variable name
      advance();                     // consume the "="
      const value = expression();
      consume(TokenType.Semicolon, "Expected ';' after assignment.");
      return { kind: "Assign", name, value };
    }

    // Otherwise it's a plain expression statement, e.g.  print("hi");
    const expr = expression();
    consume(TokenType.Semicolon, "Expected ';' after statement.");
    return { kind: "ExprStmt", expr };
  }


  // ===========================================================================
  // EXPRESSIONS — the precedence ladder
  // Each function handles one precedence level and delegates upward to the
  // next-tighter level. This structure guarantees correct operator precedence.
  // ===========================================================================

  // Entry point for parsing any expression.
  function expression(): Expr {
    return or();
  }

  // || — lowest precedence, left-associative
  // e.g.  a || b || c  parses as  (a || b) || c
  function or(): Expr {
    let expr = and();
    while (match(TokenType.Or)) {
      const right = and();
      expr = { kind: "Binary", op: "||", left: expr, right };
    }
    return expr;
  }

  // && — above ||, left-associative
  function and(): Expr {
    let expr = equality();
    while (match(TokenType.And)) {
      const right = equality();
      expr = { kind: "Binary", op: "&&", left: expr, right };
    }
    return expr;
  }

  // == and != — above &&
  function equality(): Expr {
    let expr = comparison();
    while (match(TokenType.EqualEqual, TokenType.BangEqual)) {
      const op = previous().lexeme as "==" | "!=";
      const right = comparison();
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // <, <=, >, >= — above == and !=
  function comparison(): Expr {
    let expr = addition();
    while (match(TokenType.Less, TokenType.LessEqual, TokenType.Greater, TokenType.GreaterEqual)) {
      const op = previous().lexeme as "<" | "<=" | ">" | ">=";
      const right = addition();
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // + and - — above comparisons
  function addition(): Expr {
    let expr = multiplication();
    while (match(TokenType.Plus, TokenType.Minus)) {
      const op = previous().lexeme as "+" | "-";
      const right = multiplication();
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // * and / — above + and -
  function multiplication(): Expr {
    let expr = unary();
    while (match(TokenType.Star, TokenType.Slash)) {
      const op = previous().lexeme as "*" | "/";
      const right = unary();
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // Prefix operators: ! and unary minus.
  // These are right-associative and bind very tightly (e.g.  !x,  -y)
  // Unary minus is desugared to (0 - x) so the interpreter doesn't need
  // a separate case for it.
  function unary(): Expr {
    if (match(TokenType.Bang)) {
      return { kind: "Unary", op: "!", operand: unary() };
    }
    if (match(TokenType.Minus)) {
      return { kind: "Binary", op: "-", left: { kind: "Number", value: 0 }, right: unary() };
    }
    return call();
  }

  // Function calls — name(arg1, arg2, ...)
  // We peek one token ahead: if the current token is an identifier AND the
  // next token is "(", we treat this as a call. Otherwise fall through to primary.
  function call(): Expr {
    if (
      check(TokenType.Identifier) &&
      tokens[current + 1]?.type === TokenType.LeftParen
    ) {
      const name = advance().lexeme;
      consume(TokenType.LeftParen, "Expected '(' after function name.");

      const args: Expr[] = [];
      if (!check(TokenType.RightParen)) {
        args.push(expression());
        while (match(TokenType.Comma)) args.push(expression());
      }
      consume(TokenType.RightParen, "Expected ')' after arguments.");
      return { kind: "Call", callee: name, args };
    }
    return primary();
  }

  // Primary expressions — the "atoms" that can't be broken down further:
  // literals (numbers, strings, booleans), variable names, and parenthesized groups.
  function primary(): Expr {
    if (match(TokenType.Number))     return { kind: "Number",  value: Number(previous().literal) };
    if (match(TokenType.String))     return { kind: "String",  value: String(previous().literal) };
    if (match(TokenType.True))       return { kind: "Boolean", value: true };
    if (match(TokenType.False))      return { kind: "Boolean", value: false };
    if (match(TokenType.Identifier)) return { kind: "Variable", name: previous().lexeme };

    // Parenthesized expression — parse the inner expression, then consume the ")".
    // The parentheses themselves don't create an AST node; they just control grouping.
    if (match(TokenType.LeftParen)) {
      const expr = expression();
      consume(TokenType.RightParen, "Expected ')' after expression.");
      return expr;
    }

    throw new Error(`Expected expression near '${peek().lexeme}' at index ${peek().index}.`);
  }

  return program();
}