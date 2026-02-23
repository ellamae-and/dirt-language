export enum TokenType {
    // symbols that are just one character long
    LeftParen,
    RightParen,
    Semicolon,
    Comma,
  
    // math operators
    Plus,
    Minus,
    Star,
    Slash,
  
    // actual values (literals)
    Number, // like 123 or 3.14
    Identifier, // names like print, x, variableName
  
    // special token addat the end of input so parser knows it's reached the end
    EOF
  }
  
  // tokens represent one piece of the source code after it has been processed by the lexer
  export type Token = {

    // what type of token is it
    type: TokenType;

    // exact text from the source code
    lexeme: string;

    // the actual value (only used for numbers)
    literal?: number | string;

    // position in the sourrce code this token was found
    // will be used for error messages
    index: number;
  };
