import { lex } from "../lexer/lexer.js";
import { parse } from "../parser/parser.js";
import { Environment } from "./environment.js";
import { registerBuiltins } from "../stdlib/builtins.js";
import { Interpreter } from "./interpreter.js";

export type DirtGraphicsAPI = {
  clear: () => void;
  rect: (x: number, y: number, width: number, height: number) => void;
  circle: (x: number, y: number, radius: number) => void;
};

export type DirtConfig = {
  sourcePath?: string;
  graphics?: DirtGraphicsAPI;
};

// runs a Dirt program from a source string
export function runProgram(source: string, config: DirtConfig) {
  const tokens = lex(source);
  const program = parse(tokens);

  const globalEnv = new Environment();
  registerBuiltins(globalEnv, config);

  const interpreter = new Interpreter(globalEnv, config);
  interpreter.executeProgram(program);
}

// returns debug info for the Web IDE
export function runProgramDebug(source: string, config: DirtConfig) {
  const output: string[] = [];

  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    output.push(args.map((a) => String(a)).join(" "));
  };

  try {
    const tokens = lex(source);
    const program = parse(tokens);

    const globalEnv = new Environment();
    registerBuiltins(globalEnv, config);

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