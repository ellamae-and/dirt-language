import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { Environment } from "./environment.js";
import { registerBuiltins } from "../stdlib/builtins.js";
import { Interpreter } from "./interpreter.js";
export function runProgram(source, config) {
    const tokens = lex(source);
    const program = parse(tokens);
    const globalEnv = new Environment();
    registerBuiltins(globalEnv);
    const interpreter = new Interpreter(globalEnv, config);
    interpreter.executeProgram(program);
}
