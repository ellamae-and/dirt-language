import { Token, TokenType } from "./token.js";

export function lex(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const add = (type: TokenType, lexeme: string, literal?: number | string) => {
    tokens.push({ type, lexeme, literal, index: i });
  };

  const isDigit = (c: string) => c >= "0" && c <= "9";

  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);

  while (i < source.length) {
    const c = source[i];

    if (c === " " || c === "\r" || c === "\t" || c === "\n") {
      i++;
      continue;
    }

    if (c === "(") { add(TokenType.LeftParen, c); i++; continue; }
    if (c === ")") { add(TokenType.RightParen, c); i++; continue; }
    if (c === ";") { add(TokenType.Semicolon, c); i++; continue; }
    if (c === ",") { add(TokenType.Comma, c); i++; continue; }
    if (c === "=") { add(TokenType.Equal, c); i++; continue; }
    if (c === "+") { add(TokenType.Plus, c); i++; continue; }
    if (c === "-") { add(TokenType.Minus, c); i++; continue; }
    if (c === "*") { add(TokenType.Star, c); i++; continue; }
    if (c === "/") { add(TokenType.Slash, c); i++; continue; }

    // string literals
    if (c === '"') {
      const start = i;
      i++; // skip opening quote

      let value = "";
      while (i < source.length && source[i] !== '"') {
        value += source[i];
        i++;
      }

      if (i >= source.length) {
        throw new Error(`Unterminated string starting at index ${start}.`);
      }

      i++; // skip closing quote
      const lexeme = source.slice(start, i);
      add(TokenType.String, lexeme, value);
      continue;
    }

    // numbers
    if (isDigit(c)) {
      const start = i;

      while (i < source.length && isDigit(source[i])) i++;

      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (i < source.length && isDigit(source[i])) i++;
      }

      const text = source.slice(start, i);
      add(TokenType.Number, text, Number(text));
      continue;
    }

    // identifiers / keywords
    if (isAlpha(c)) {
      const start = i;
      while (i < source.length && isAlnum(source[i])) i++;
      const text = source.slice(start, i);

      if (text === "let") {
        add(TokenType.Let, text);
      } else {
        add(TokenType.Identifier, text);
      }

      continue;
    }

    throw new Error(`Unexpected character '${c}' at index ${i}.`);
  }

  tokens.push({ type: TokenType.EOF, lexeme: "", index: i });
  return tokens;
}