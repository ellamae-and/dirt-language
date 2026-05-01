// lexer.ts
// Turns raw source code text into a flat list of tokens.
//
// This is the very first step in running a Dirt program. Before the parser can
// understand structure (if-statements, loops, function calls), it needs the
// source broken into labeled pieces. That's what this file does.
//
//   "let x = 5 + 3;"
//    ^^^             → keyword "let"
//        ^           → identifier "x"
//          ^         → operator "="
//            ^       → number literal 5
//              ^     → operator "+"
//                ^   → number literal 3
//                  ^ → semicolon
//
// This just recognizes shapes. The parser figures out meaning in the next step.
//
// Output: a flat Token[] array, always ending with an EOF sentinel token.

import { Token, TokenType } from "./token.js";


export function lex(source: string): Token[] {

  const tokens: Token[] = [];

  // i is our read cursor — the index of the character we're currently looking at.
  // It only ever moves forward; we never backtrack.
  let i = 0;

  // Helper to push a completed token onto the list.
  //
  // Parameters:
  //   type       — what kind of token this is (a TokenType enum value)
  //   lexeme     — the exact text from the source, e.g. "let", "42", "++"
  //   literal    — the parsed JS value, only used for numbers and strings:
  //                  Number token → the actual JS number (e.g. 42, not "42")
  //                  String token → the content without quotes (e.g. hello, not "hello")
  //   startIndex — where in the source string this token STARTS.
  //
  // Why startIndex is optional:
  //   For single-character tokens (+ ; ( etc.) we call add() BEFORE advancing i,
  //   so i already points at the right character — startIndex can be omitted.
  //
  //   For multi-character tokens (identifiers, numbers, strings) we scan ahead
  //   until i has passed the whole token, THEN call add(). By that point i points
  //   PAST the token, so callers must capture the start position before scanning
  //   and pass it in explicitly.
  //
  //   Getting this right matters for error messages: if we store the wrong index,
  //   the IDE will highlight the wrong line when it reports an error. This is what is happening
  //   right now, but I'm in too deep now to go back because everything is built on top of it
  const add = (type: TokenType, lexeme: string, literal?: number | string, startIndex?: number) => {
    tokens.push({ type, lexeme, literal, index: startIndex ?? i });
  };

  // ── Character classification helpers ────────────────────────────────────────
  // These are used throughout the scanning loop to decide what kind of character
  // we're currently looking at. They're small but called a lot, so they're
  // defined as arrow functions to keep the call site readable.

  // Is this character a decimal digit? (0–9)
  const isDigit = (c: string) => c >= "0" && c <= "9";

  // Is this character a letter or underscore?
  // Underscores are allowed in Dirt identifiers (e.g. my_variable).
  const isAlpha = (c: string) =>
    (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";

  // Is this character allowed INSIDE an identifier (letter, digit, or underscore)?
  // Identifiers can start with a letter but can contain digits after the first character.
  const isAlnum = (c: string) => isAlpha(c) || isDigit(c);


  // ── Main scanning loop ───────────────────────────────────────────────────────
  // We consume one "thing" per iteration — a token, a whitespace run, or a comment.
  // Each branch ends with continue so we go back to the top and look at the next character.

  while (i < source.length) {
    const c = source[i];

    // ── Whitespace ──────────────────────────────────────────────────────────
    // Spaces, carriage returns, tabs, and newlines are all just separators in Dirt.
    // They don't produce tokens — we just skip over them.
    if (c === " " || c === "\r" || c === "\t" || c === "\n") {
      i++;
      continue;
    }

    // ── Single-line comments ─────────────────────────────────────────────────
    // A comment starts with // and runs to the end of the line.
    // We check source[i+1] here (peeking one ahead) because a single "/" alone
    // is the division operator and should NOT be treated as a comment.
    if (c === "/" && source[i + 1] === "/") {
      // Keep advancing until we hit a newline or run out of source.
      // We don't consume the newline itself — the whitespace handler above
      // will skip it on the next iteration.
      while (i < source.length && source[i] !== "\n") i++;
      continue;
    }

    // ── Single-character tokens ──────────────────────────────────────────────
    // These are characters that always mean exactly one thing.
    // We call add() with i still pointing at the character, THEN advance i.
    // That way the token's index points at the character itself.
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

    // ── Two-character operators ──────────────────────────────────────────────
    // Some characters are ambiguous on their own — "=" could be assignment OR
    // part of "==". We peek at source[i+1] to decide which token to emit.
    //
    // Note: for these we call add() BEFORE advancing i, so i still points at
    // the first character of the operator. That gives the token the correct
    // start index without needing to pass startIndex explicitly.

    // = vs ==
    if (c === "=") {
      if (source[i + 1] === "=") { add(TokenType.EqualEqual,   "=="); i += 2; }
      else                       { add(TokenType.Equal,         "=");  i++;    }
      continue;
    }

    // ! vs !=
    if (c === "!") {
      if (source[i + 1] === "=") { add(TokenType.BangEqual,    "!="); i += 2; }
      else                       { add(TokenType.Bang,          "!");  i++;    }
      continue;
    }

    // < vs <=
    if (c === "<") {
      if (source[i + 1] === "=") { add(TokenType.LessEqual,    "<="); i += 2; }
      else                       { add(TokenType.Less,          "<");  i++;    }
      continue;
    }

    // > vs >=
    if (c === ">") {
      if (source[i + 1] === "=") { add(TokenType.GreaterEqual, ">="); i += 2; }
      else                       { add(TokenType.Greater,       ">");  i++;    }
      continue;
    }

    // && and || — these MUST be two characters; a lone & or | is not valid in Dirt.
    // We check both characters together so we don't accidentally emit a partial token.
    if (c === "&" && source[i + 1] === "&") { add(TokenType.And, "&&"); i += 2; continue; }
    if (c === "|" && source[i + 1] === "|") { add(TokenType.Or,  "||"); i += 2; continue; }


    // ── String literals ──────────────────────────────────────────────────────
    // A string starts with a double-quote and runs until the next unescaped
    // double-quote. Backslash sequences let you embed special characters.
    //
    // We need to capture `start` before scanning ahead because by the time we
    // call add(), i will be past the closing quote. Passing `start` ensures the
    // token's index points at the opening quote, not somewhere after it.
    if (c === '"') {
      const start = i; // remember where the opening " was
      i++;             // step past the opening quote before collecting content

      let value = ""; // the string content WITHOUT the surrounding quotes

      // Collect characters until we hit the closing quote or run out of source.
      while (i < source.length && source[i] !== '"') {

        // Backslash escape sequences — translate them into their actual characters.
        // For example, the two characters \ and n in source become a newline in the value.
        if (source[i] === "\\" && i + 1 < source.length) {
          const next = source[i + 1];
          if (next === "n")  { value += "\n"; i += 2; continue; } // newline
          if (next === "t")  { value += "\t"; i += 2; continue; } // tab
          if (next === "\\") { value += "\\"; i += 2; continue; } // literal backslash
          if (next === '"')  { value += '"';  i += 2; continue; } // escaped quote
          // Any other escape sequence (\x, \0, etc.) falls through and the
          // backslash is treated as a plain character.
        }

        value += source[i];
        i++;
      }

      // If we reached the end of the file without finding the closing quote,
      // that's a syntax error — tell the user where the string started.
      if (i >= source.length) {
        throw new Error(`Unterminated string starting at index ${start}.`);
      }

      i++; // step past the closing quote

      // lexeme is the full source text including quotes, e.g. `"hello"`
      // value  is just the content without quotes, e.g. `hello`
      const lexeme = source.slice(start, i);
      add(TokenType.String, lexeme, value, start); // pass start → token index = opening quote
      continue;
    }


    // ── Number literals ──────────────────────────────────────────────────────
    // Numbers are sequences of digits, optionally with a single decimal point.
    // Examples: 0, 42, 3.14, 100
    //
    // Like strings, we capture `start` before scanning so the token's index
    // points at the first digit even after i has moved past the whole number.
    if (isDigit(c)) {
      const start = i; // remember the first digit's position

      // Collect all the leading integer digits.
      while (i < source.length && isDigit(source[i])) i++;

      // Check if there's a decimal point followed by more digits.
      // We require at least one digit after the dot — something like "3." alone
      // is NOT a valid decimal in Dirt (the dot would be an unknown character).
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++; // consume the dot
        while (i < source.length && isDigit(source[i])) i++;
      }

      const text = source.slice(start, i);
      add(TokenType.Number, text, Number(text), start); // pass start → token index = first digit
      continue;
    }


    // ── Identifiers and keywords ─────────────────────────────────────────────
    // Identifiers start with a letter or underscore and can contain letters,
    // digits, and underscores. After collecting the full word, we check whether
    // it's one of Dirt's reserved keywords.
    //
    // Examples:
    //   "let"       → keyword Let  (reserved)
    //   "while"     → keyword While (reserved)
    //   "myScore"   → Identifier (user-defined name)
    //   "isAlive"   → Identifier
    //
    // We pass `start` to every branch in the switch so all of them — keywords
    // AND identifiers — get the correct source position. Without this, the token
    // index would point past the word instead of at its first character, which
    // was the root cause of the wrong-line-number bug in error messages.
    if (isAlpha(c)) {
      const start = i; // remember the first character's position

      // Consume the rest of the word (letters, digits, underscores).
      while (i < source.length && isAlnum(source[i])) i++;

      const text = source.slice(start, i);

      // Check if it's a reserved keyword; if not, it's a plain identifier.
      // Every branch passes `undefined` for literal (keywords have no JS value)
      // and `start` so the token index is accurate.
      switch (text) {
        case "let":    add(TokenType.Let,        text, undefined, start); break;
        case "if":     add(TokenType.If,         text, undefined, start); break;
        case "else":   add(TokenType.Else,       text, undefined, start); break;
        case "while":  add(TokenType.While,      text, undefined, start); break;
        case "fn":     add(TokenType.Fn,         text, undefined, start); break;
        case "return": add(TokenType.Return,     text, undefined, start); break;
        case "true":   add(TokenType.True,       text, undefined, start); break;
        case "false":  add(TokenType.False,      text, undefined, start); break;
        default:       add(TokenType.Identifier, text, undefined, start); break;
      }
      continue;
    }

    // ── Unrecognized character ───────────────────────────────────────────────
    // If we reach here, the current character isn't part of any token Dirt knows.
    // Throw a clear error so the user knows exactly which character and where it is.
    throw new Error(`Unexpected character '${c}' at index ${i}.`);
  }

  // ── EOF sentinel ────────────────────────────────────────────────────────────
  // Always append an EOF token at the end of the list.
  // The parser reads this to know it has consumed everything — it's cleaner than
  // checking for an out-of-bounds array index everywhere.
  tokens.push({ type: TokenType.EOF, lexeme: "", index: i });
  return tokens;
}