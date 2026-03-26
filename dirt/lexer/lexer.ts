// lexer.ts
// Turns raw source code text into a list of tokens.
//
// This is the very first step in running a Dirt program. The lexer scans the
// source string one character at a time, figures out what each chunk of text
// means, and labels it — "this is a number", "this is the keyword 'while'",
// "this is a plus sign", etc.
//
// The output is a flat array of Token objects that the parser reads next.
// The lexer knows nothing about grammar — it just recognizes individual pieces.

import { Token, TokenType } from "./token.js";


export function lex(source: string): Token[] {

  const tokens: Token[] = [];
  let i = 0; // our read cursor — the index of the character we're currently looking at

  // Push a finished token onto the list.
  // "literal" is only passed for Number and String tokens — it's the actual
  // parsed JS value (the number 42, or the string "hello" without quotes).
  const add = (type: TokenType, lexeme: string, literal?: number | string) => {
    tokens.push({ type, lexeme, literal, index: i });
  };

  // Character helpers — check what kind of character we're looking at.
  const isDigit = (c: string) => c >= "0" && c <= "9";
  const isAlpha = (c: string) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);


  while (i < source.length) {
    const c = source[i];

    // Skip whitespace — spaces, tabs, and newlines are just separators in Dirt.
    if (c === " " || c === "\r" || c === "\t" || c === "\n") {
      i++;
      continue;
    }

    // Single-line comments start with //. Skip everything until the end of the line.
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // Single-character tokens — these are always exactly one character and unambiguous.
    if (c === "(") { add(TokenType.LeftParen,  c); i++; continue; }
    if (c === ")") { add(TokenType.RightParen, c); i++; continue; }
    if (c === "{") { add(TokenType.LeftBrace,  c); i++; continue; }
    if (c === "}") { add(TokenType.RightBrace, c); i++; continue; }
    if (c === ";") { add(TokenType.Semicolon,  c); i++; continue; }
    if (c === ",") { add(TokenType.Comma,       c); i++; continue; }
    if (c === "+") { add(TokenType.Plus,        c); i++; continue; }
    if (c === "-") { add(TokenType.Minus,       c); i++; continue; }
    if (c === "*") { add(TokenType.Star,        c); i++; continue; }
    if (c === "/") { add(TokenType.Slash,       c); i++; continue; }

    // Two-character operators — we peek one character ahead to decide which token to emit.
    // e.g. "=" alone is assignment, but "==" is equality comparison.
    if (c === "=") {
      if (source[i + 1] === "=") { add(TokenType.EqualEqual,   "=="); i += 2; }
      else                       { add(TokenType.Equal,         "=");  i++;    }
      continue;
    }
    if (c === "!") {
      if (source[i + 1] === "=") { add(TokenType.BangEqual,    "!="); i += 2; }
      else                       { add(TokenType.Bang,          "!");  i++;    }
      continue;
    }
    if (c === "<") {
      if (source[i + 1] === "=") { add(TokenType.LessEqual,    "<="); i += 2; }
      else                       { add(TokenType.Less,          "<");  i++;    }
      continue;
    }
    if (c === ">") {
      if (source[i + 1] === "=") { add(TokenType.GreaterEqual, ">="); i += 2; }
      else                       { add(TokenType.Greater,       ">");  i++;    }
      continue;
    }

    // && and || — must be exactly two characters each.
    if (c === "&" && source[i + 1] === "&") { add(TokenType.And, "&&"); i += 2; continue; }
    if (c === "|" && source[i + 1] === "|") { add(TokenType.Or,  "||"); i += 2; continue; }


    // String literals — everything between a pair of double quotes.
    // We collect characters one by one, handling escape sequences as we go.
    if (c === '"') {
      const start = i;
      i++; // step past the opening quote

      let value = "";
      while (i < source.length && source[i] !== '"') {
        // Handle backslash escape sequences so strings can contain
        // newlines (\n), tabs (\t), backslashes (\\), and quotes (\").
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          if (next === "n")  { value += "\n"; i += 2; continue; }
          if (next === "t")  { value += "\t"; i += 2; continue; }
          if (next === "\\") { value += "\\"; i += 2; continue; }
          if (next === '"')  { value += '"';  i += 2; continue; }
        }
        value += source[i];
        i++;
      }

      // If we hit the end of the file before finding the closing quote, that's an error.
      if (i >= source.length) {
        throw new Error(`Unterminated string starting at index ${start}.`);
      }

      i++; // step past the closing quote
      const lexeme = source.slice(start, i); // the full "..." text including quotes
      add(TokenType.String, lexeme, value);  // value is the string content WITHOUT quotes
      continue;
    }


    // Number literals — integer or decimal, e.g. 42 or 3.14
    // We collect all leading digits, then optionally a dot and more digits.
    if (isDigit(c)) {
      const start = i;
      while (i < source.length && isDigit(source[i])) i++;

      // Check for a decimal point followed by more digits (e.g. 3.14).
      // We require at least one digit after the dot so a trailing dot like "3."
      // is NOT treated as a decimal — the dot would be a separate unknown character.
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (i < source.length && isDigit(source[i])) i++;
      }

      const text = source.slice(start, i);
      add(TokenType.Number, text, Number(text)); // literal is the actual JS number
      continue;
    }


    // Identifiers and keywords — anything starting with a letter or underscore.
    // We collect the full word, then check if it's a reserved keyword.
    // If it is, we emit a keyword token; otherwise it's a user identifier.
    if (isAlpha(c)) {
      const start = i;
      while (i < source.length && isAlnum(source[i])) i++;
      const text = source.slice(start, i);

      switch (text) {
        case "let":    add(TokenType.Let,    text); break;
        case "if":     add(TokenType.If,     text); break;
        case "else":   add(TokenType.Else,   text); break;
        case "while":  add(TokenType.While,  text); break;
        case "fn":     add(TokenType.Fn,     text); break;
        case "return": add(TokenType.Return, text); break;
        case "true":   add(TokenType.True,   text); break;
        case "false":  add(TokenType.False,  text); break;
        default:       add(TokenType.Identifier, text); break;
      }
      continue;
    }

    // If we reach here, the character isn't something Dirt recognizes.
    throw new Error(`Unexpected character '${c}' at index ${i}.`);
  }

  // Always end the token list with an EOF sentinel so the parser
  // has a clean signal for "there's nothing left to read".
  tokens.push({ type: TokenType.EOF, lexeme: "", index: i });
  return tokens;
}