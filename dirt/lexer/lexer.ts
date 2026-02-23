// defines what tokens exist in the language
import { Token, TokenType } from "./token.js";

//takes raw source code and converts it into a list of tokens
export function lex(source: string): Token[] {
  const tokens: Token[] = [];

  // position pointer inside the source string
  let i = 0;

  // helper function to create and add a token
  const add = (type: TokenType, lexeme: string, literal?: number | string) => {
    tokens.push({ type, lexeme, literal, index: i });
  };

  // checks if a character is a number
  const isDigit = (c: string) => c >= "0" && c <= "9";

  // checks if a character is a letter or underscore
  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  // checks if a character is a letter OR number
  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);

  // loop through the entire source code
  while (i < source.length) {
    const c = source[i];

    // skip whitespace characters
    if (c === " " || c === "\r" || c === "\t" || c === "\n") {
      i++;
      continue;
    }

    // single-character tokens
    if (c === "(") { add(TokenType.LeftParen, c); i++; continue; }
    if (c === ")") { add(TokenType.RightParen, c); i++; continue; }
    if (c === ";") { add(TokenType.Semicolon, c); i++; continue; }
    if (c === ",") { add(TokenType.Comma, c); i++; continue; }
    if (c === "+") { add(TokenType.Plus, c); i++; continue; }
    if (c === "-") { add(TokenType.Minus, c); i++; continue; }
    if (c === "*") { add(TokenType.Star, c); i++; continue; }
    if (c === "/") { add(TokenType.Slash, c); i++; continue; }

    // if we find a number, collect it as a token
    if (isDigit(c)) {
      const start = i;

      // read all digits
      while (i < source.length && isDigit(source[i])) i++;

      // handle decimals
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (i < source.length && isDigit(source[i])) i++;
      }
      const text = source.slice(start, i);
      add(TokenType.Number, text, Number(text));
      continue;
    }

    // if we find a letter, collect the full identifier.
    if (isAlpha(c)) {
      const start = i;
      while (i < source.length && isAlnum(source[i])) i++;
      const text = source.slice(start, i);
      add(TokenType.Identifier, text);
      continue;
    }

    // if we get here, the character is invalid
    throw new Error(`Unexpected character '${c}' at index ${i}.`);
  }

  // add an end of file token
  tokens.push({ type: TokenType.EOF, lexeme: "", index: i });
  return tokens;
}