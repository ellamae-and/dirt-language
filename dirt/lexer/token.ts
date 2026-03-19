export enum TokenType {
  // symbols that are just one character long
  LeftParen,
  RightParen,
  Semicolon,
  Comma,
  Equal,

  // math operators
  Plus,
  Minus,
  Star,
  Slash,

  // actual values
  Number,
  String,
  Identifier,

  // keywords
  Let,

  // special token at the end
  EOF
}

export type Token = {
  type: TokenType;
  lexeme: string;
  literal?: number | string;
  index: number;
};