import { Environment } from "../runtime/environment.js";

// adds built in functions to the global environment
export function registerBuiltins(env: Environment) {

  // add a built in function named "print" to memory
  env.define("print", (...args: unknown[]) => {
    console.log(...args);
    return null;
  });
}
