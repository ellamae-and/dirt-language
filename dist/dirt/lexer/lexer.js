import { TokenType } from "./token.js";
export function lex(source) {
    const tokens = [];
    let i = 0;
    const add = (type, lexeme, literal) => {
        tokens.push({ type, lexeme, literal, index: i });
    };
    const isDigit = (c) => c >= "0" && c <= "9";
    const isAlpha = (c) => (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
    const isAlnum = (c) => isAlpha(c) || isDigit(c);
    while (i < source.length) {
        const c = source[i];
        // whitespace
        if (c === " " || c === "\r" || c === "\t" || c === "\n") {
            i++;
            continue;
        }
        // single-character tokens
        if (c === "(") {
            add(TokenType.LeftParen, c);
            i++;
            continue;
        }
        if (c === ")") {
            add(TokenType.RightParen, c);
            i++;
            continue;
        }
        if (c === ";") {
            add(TokenType.Semicolon, c);
            i++;
            continue;
        }
        if (c === ",") {
            add(TokenType.Comma, c);
            i++;
            continue;
        }
        if (c === "+") {
            add(TokenType.Plus, c);
            i++;
            continue;
        }
        if (c === "-") {
            add(TokenType.Minus, c);
            i++;
            continue;
        }
        if (c === "*") {
            add(TokenType.Star, c);
            i++;
            continue;
        }
        if (c === "/") {
            add(TokenType.Slash, c);
            i++;
            continue;
        }
        // number
        if (isDigit(c)) {
            const start = i;
            while (i < source.length && isDigit(source[i]))
                i++;
            if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
                i++;
                while (i < source.length && isDigit(source[i]))
                    i++;
            }
            const text = source.slice(start, i);
            add(TokenType.Number, text, Number(text));
            continue;
        }
        // identifier
        if (isAlpha(c)) {
            const start = i;
            while (i < source.length && isAlnum(source[i]))
                i++;
            const text = source.slice(start, i);
            add(TokenType.Identifier, text);
            continue;
        }
        throw new Error(`Unexpected character '${c}' at index ${i}.`);
    }
    tokens.push({ type: TokenType.EOF, lexeme: "", index: i });
    return tokens;
}
