import { Environment } from "../runtime/environment.js";
import type { DirtConfig } from "../runtime/runProgram.js";

function expectNumber(value: unknown, name: string): number {
  if (typeof value !== "number") {
    throw new Error(`${name} must be a number.`);
  }
  return value;
}

export function registerBuiltins(env: Environment, config: DirtConfig) {
  env.define("print", (...args: unknown[]) => {
    console.log(...args);
    return null;
  });

  env.define("clear", () => {
    if (!config.graphics) {
      throw new Error("Graphics API is not available.");
    }

    config.graphics.clear();
    return null;
  });

  env.define("rect", (x: unknown, y: unknown, width: unknown, height: unknown) => {
    if (!config.graphics) {
      throw new Error("Graphics API is not available.");
    }

    config.graphics.rect(
      expectNumber(x, "x"),
      expectNumber(y, "y"),
      expectNumber(width, "width"),
      expectNumber(height, "height")
    );

    return null;
  });

  env.define("circle", (x: unknown, y: unknown, radius: unknown) => {
    if (!config.graphics) {
      throw new Error("Graphics API is not available.");
    }

    config.graphics.circle(
      expectNumber(x, "x"),
      expectNumber(y, "y"),
      expectNumber(radius, "radius")
    );

    return null;
  });
}