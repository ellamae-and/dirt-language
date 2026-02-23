import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { Environment } from "./environment.js";
import { registerBuiltins } from "../stdlib/builtins.js";
import { Interpreter } from "./interpreter.js"; 

export type DirtConfig = {
  sourcePath?: string;
};

// runs a Dirt program from a source string
export function runProgram(source: string, config: DirtConfig) {

  // convert raw text into tokens
  const tokens = lex(source);

  // convert tokens into an AST 
  const program = parse(tokens);

  // create a new global environment 
  const globalEnv = new Environment();

  // add built-in functions into the environment
  registerBuiltins(globalEnv);

  // create an interpreter with that environment
  const interpreter = new Interpreter(globalEnv, config);

   // execute the program 
  interpreter.executeProgram(program);
}