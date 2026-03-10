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
  const tokens = lex(source);
  const program = parse(tokens);

  const globalEnv = new Environment();
  registerBuiltins(globalEnv);

  const interpreter = new Interpreter(globalEnv, config);
  interpreter.executeProgram(program);
}

// NEW: returns debug info for the Web IDE
export function runProgramDebug(source: string, config: DirtConfig) {
  const output: string[] = [];

  // capture console.log temporarily (because your built-in print uses console.log)
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    output.push(args.map(a => String(a)).join(" "));
  };

  try {
    const tokens = lex(source);
    const program = parse(tokens);

    const globalEnv = new Environment();
    registerBuiltins(globalEnv);

    const interpreter = new Interpreter(globalEnv, config);
    interpreter.executeProgram(program);

    return {
      ok: true as const,
      output,
      tokens,
      ast: program,
      env: globalEnv.dump(),
    };
  } catch (e) {
    return {
      ok: false as const,
      output,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    console.log = originalLog;
  }
}