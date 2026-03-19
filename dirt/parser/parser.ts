import { Token, TokenType } from "../lexer/token.js";
import { Expr, Program, Stmt } from "./ast.js";

export function parse(tokens: Token[]): Program {
  let current = 0;

  const peek = () => tokens[current];
  const previous = () => tokens[current - 1];
  const isAtEnd = () => peek().type === TokenType.EOF;

  const advance = () => {
    if (!isAtEnd()) current++;
    return previous();
  };

  const check = (type: TokenType) => !isAtEnd() && peek().type === type;

  const match = (...types: TokenType[]) => {
    for (const t of types) {
      if (check(t)) {
        advance();
        return true;
      }
    }
    return false;
  };

  const consume = (type: TokenType, msg: string) => {
    if (check(type)) return advance();
    throw new Error(msg);
  };

  function program(): Program {
    const statements: Stmt[] = [];
    while (!isAtEnd()) statements.push(statement());
    return { kind: "Program", statements };
  }

  function statement(): Stmt {
    if (match(TokenType.Let)) return varDeclaration();

    const expr = expression();
    consume(TokenType.Semicolon, "Expected ';' after statement.");
    return { kind: "ExprStmt", expr };
  }

  function varDeclaration(): Stmt {
    const name = consume(TokenType.Identifier, "Expected variable name.").lexeme;
    consume(TokenType.Equal, "Expected '=' after variable name.");
    const initializer = expression();
    consume(TokenType.Semicolon, "Expected ';' after variable declaration.");
    return { kind: "VarDecl", name, initializer };
  }

  function expression(): Expr {
    return addition();
  }

  function addition(): Expr {
    let expr = multiplication();

    while (match(TokenType.Plus, TokenType.Minus)) {
      const opTok = previous();
      const right = multiplication();
      const op = opTok.type === TokenType.Plus ? "+" : "-";
      expr = { kind: "Binary", op, left: expr, right };
    }

    return expr;
  }

  function multiplication(): Expr {
    let expr = call();

    while (match(TokenType.Star, TokenType.Slash)) {
      const opTok = previous();
      const right = call();
      const op = opTok.type === TokenType.Star ? "*" : "/";
      expr = { kind: "Binary", op, left: expr, right };
    }

    return expr;
  }

  function call(): Expr {
    if (check(TokenType.Identifier) && tokens[current + 1]?.type === TokenType.LeftParen) {
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

  function primary(): Expr {
    if (match(TokenType.Number)) {
      return { kind: "Number", value: Number(previous().literal) };
    }

    if (match(TokenType.String)) {
      return { kind: "String", value: String(previous().literal) };
    }

    if (match(TokenType.Identifier)) {
      return { kind: "Variable", name: previous().lexeme };
    }

    throw new Error(`Expected expression near '${peek().lexeme}'.`);
  }

  return program();
}