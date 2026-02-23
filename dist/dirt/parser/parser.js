import { TokenType } from "../lexer/token.js";
export function parse(tokens) {
    let current = 0;
    const peek = () => tokens[current];
    const previous = () => tokens[current - 1];
    const isAtEnd = () => peek().type === TokenType.EOF;
    const advance = () => {
        if (!isAtEnd())
            current++;
        return previous();
    };
    const check = (type) => !isAtEnd() && peek().type === type;
    const match = (...types) => {
        for (const t of types) {
            if (check(t)) {
                advance();
                return true;
            }
        }
        return false;
    };
    const consume = (type, msg) => {
        if (check(type))
            return advance();
        throw new Error(msg);
    };
    function program() {
        const statements = [];
        while (!isAtEnd())
            statements.push(statement());
        return { kind: "Program", statements };
    }
    // statement → expression ";" ;
    function statement() {
        const expr = expression();
        consume(TokenType.Semicolon, "Expected ';' after statement.");
        return { kind: "ExprStmt", expr };
    }
    // expression → addition ;
    function expression() {
        return addition();
    }
    // addition → multiplication ( ( "+" | "-" ) multiplication )* ;
    function addition() {
        let expr = multiplication();
        while (match(TokenType.Plus, TokenType.Minus)) {
            const opTok = previous();
            const right = multiplication();
            const op = opTok.type === TokenType.Plus ? "+" : "-";
            expr = { kind: "Binary", op, left: expr, right };
        }
        return expr;
    }
    // multiplication → call ( ( "*" | "/" ) call )* ;
    function multiplication() {
        let expr = call();
        while (match(TokenType.Star, TokenType.Slash)) {
            const opTok = previous();
            const right = call();
            const op = opTok.type === TokenType.Star ? "*" : "/";
            expr = { kind: "Binary", op, left: expr, right };
        }
        return expr;
    }
    // call → IDENTIFIER "(" arguments? ")" | primary ;
    function call() {
        if (check(TokenType.Identifier) && tokens[current + 1]?.type === TokenType.LeftParen) {
            const name = advance().lexeme;
            consume(TokenType.LeftParen, "Expected '(' after function name.");
            const args = [];
            if (!check(TokenType.RightParen)) {
                args.push(expression());
                while (match(TokenType.Comma))
                    args.push(expression());
            }
            consume(TokenType.RightParen, "Expected ')' after arguments.");
            return { kind: "Call", callee: name, args };
        }
        return primary();
    }
    // primary → NUMBER ;
    function primary() {
        if (match(TokenType.Number)) {
            return { kind: "Number", value: Number(previous().literal) };
        }
        throw new Error(`Expected expression near '${peek().lexeme}'.`);
    }
    return program();
}
