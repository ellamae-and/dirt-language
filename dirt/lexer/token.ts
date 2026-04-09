// token.ts
// Defines every kind of "word" the Dirt language can contain.
//
// Before the program runs, the source code is broken into a list of tokens —
// small labeled pieces like "this is a number", "this is the keyword 'if'",
// "this is a plus sign". Everything downstream (the parser, error messages)
// works with these labeled pieces instead of raw text.

export enum TokenType {
  // Single-character punctuation
  LeftParen,    // (
  RightParen,   // )
  LeftBrace,    // {
  RightBrace,   // }
  Semicolon,    // ;
  Comma,        // ,

  // A single = means assignment (let x = 5), NOT a comparison.
  // Equality comparison is EqualEqual (==) below.
  Equal,

  // Comparison operators — these produce true or false
  EqualEqual,   // ==
  BangEqual,    // !=
  Less,         // <
  LessEqual,    // <=
  Greater,      // >
  GreaterEqual, // >=

  // Logical operators
  Bang,         // !  (logical NOT)
  And,          // && (both sides must be true)
  Or,           // || (at least one side must be true)

  // Math operators
  Plus,         // +
  Minus,        // -
  Star,         // *
  Slash,        // /

  // Tokens that carry an actual value
  Number,       // e.g. 42 or 3.14
  String,       // e.g. "hello"
  Identifier,   // a variable or function name, e.g. x or update

  // Reserved words — these look like identifiers but mean something specific
  Let,
  If,
  Else,
  While,
  Fn,
  Return,
  True,
  False,

  // A fake token placed at the very end of every token list.
  // The parser reads this to know it has reached the end of the program.
  EOF
}

// One token — a labeled chunk of source code.
export type Token = {
  type:     TokenType;         // what kind of token this is
  lexeme:   string;            // the exact text from the source, e.g. "let", "42", "+"
  literal?: number | string;   // the parsed value — only present for Number and String tokens
  index:    number;            // where in the source string this token starts (used in error messages)
};