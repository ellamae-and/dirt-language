import { Token, TokenType } from "../lexer/token.js";
import { Expr, Program, Stmt } from "./ast.js";

// parser takes a list of tokens from the lexer and build a program (AST) from them
export function parse(tokens: Token[]): Program {

  // our position in the token list
  let current = 0;

  // look at the current token without consuming it
  const peek = () => tokens[current];

  // look at the token we just consumed
  const previous = () => tokens[current - 1];

  // check if we've reached the end of the file
  const isAtEnd = () => peek().type === TokenType.EOF;

  // move forward one token and return the token we moved past
  const advance = () => {
    if (!isAtEnd()) current++;
    return previous();
  };

  // check if the current token is a specific type
  const check = (type: TokenType) => !isAtEnd() && peek().type === type;

  // if the token matches any of these types, consume it and return true
  const match = (...types: TokenType[]) => {
    for (const t of types) {
      if (check(t)) { advance(); return true; }
    }
    return false;
  };

  // require a specific token type, if it's there, consume it
  const consume = (type: TokenType, msg: string) => {
    if (check(type)) return advance();
    throw new Error(msg);
  };

  // read statements until we hit EOF
  function program(): Program {
    const statements: Stmt[] = [];
    while (!isAtEnd()) statements.push(statement());
    return { kind: "Program", statements };
  }

  // a statement is an expression that MUST end with a semicolon.
  function statement(): Stmt {
    const expr = expression();
    consume(TokenType.Semicolon, "Expected ';' after statement.");
    return { kind: "ExprStmt", expr };
  }

  // the highest level of expression is addition
  function expression(): Expr {
    return addition();
  }

  // this handles + and - with the correct priority
  // example: 1 + 2 + 3 becomes ((1+2)+3)
  function addition(): Expr {
    let expr = multiplication();
    while (match(TokenType.Plus, TokenType.Minus)) {
      const opTok = previous();
      const right = multiplication();
      const op = opTok.type === TokenType.Plus ? "+" : "-";

      // build a Binary AST node
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // this handles * and / with higher priority than + and -
  // example: 1 + 2 * 3 parses as 1 + (2*3), not (1+2)*3
  function multiplication(): Expr {
    let expr = call();
    while (match(TokenType.Star, TokenType.Slash)) {
      const opTok = previous();
      const right = call();
      const op = opTok.type === TokenType.Star ? "*" : "/";

      // build a Binary AST node
      expr = { kind: "Binary", op, left: expr, right };
    }
    return expr;
  }

  // this parses function calls like print(1 + 2)
  function call(): Expr {

    // check for indentifier followed by '(' to detect a function call
    if (check(TokenType.Identifier) && tokens[current + 1]?.type === TokenType.LeftParen) {

      // consume the identifier (function name)
      const name = advance().lexeme;
      consume(TokenType.LeftParen, "Expected '(' after function name.");

      // collect arguements into an array
      const args: Expr[] = [];

      // if the next token is not ')', we have at least one argument
      if (!check(TokenType.RightParen)) {
        args.push(expression());

        // keep reading arugments until we see commas
        while (match(TokenType.Comma)) args.push(expression());
      }
      consume(TokenType.RightParen, "Expected ')' after arguments.");

      // build a Call AST node
      return { kind: "Call", callee: name, args };
    }

    // if it is not a function call, parse a basic value
    return primary();
  }

  // simplest form of expression, a number literal
  function primary(): Expr {
    if (match(TokenType.Number)) {
      return { kind: "Number", value: Number(previous().literal) };
    }
    throw new Error(`Expected expression near '${peek().lexeme}'.`);
  }

  return program();
}