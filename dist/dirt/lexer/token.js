export var TokenType;
(function (TokenType) {
    // Single-character tokens
    TokenType[TokenType["LeftParen"] = 0] = "LeftParen";
    TokenType[TokenType["RightParen"] = 1] = "RightParen";
    TokenType[TokenType["Semicolon"] = 2] = "Semicolon";
    TokenType[TokenType["Comma"] = 3] = "Comma";
    // Operators
    TokenType[TokenType["Plus"] = 4] = "Plus";
    TokenType[TokenType["Minus"] = 5] = "Minus";
    TokenType[TokenType["Star"] = 6] = "Star";
    TokenType[TokenType["Slash"] = 7] = "Slash";
    // Literals
    TokenType[TokenType["Number"] = 8] = "Number";
    TokenType[TokenType["Identifier"] = 9] = "Identifier";
    TokenType[TokenType["EOF"] = 10] = "EOF";
})(TokenType || (TokenType = {}));
