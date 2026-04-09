// environment.ts
// Stores variables and their values for a given scope.
//
// Every time Dirt enters a new scope (a block, a function call, the global program)
// it creates a new Environment. Environments are linked to their parent — so if a
// variable isn't found in the current scope, the lookup automatically climbs up
// to the enclosing scope, then its parent, and so on, all the way to global.
//
// Example of the chain in action:
//   let x = 10;          // lives in the global environment
//   fn show() {
//     print(x);          // x isn't in show's local env, so we climb up and find it globally
//   }

export class Environment {

  // The variables stored in this particular scope.
  private values = new Map<string, unknown>();

  // parent is the enclosing scope. The global environment has no parent.
  // Function call environments use the closure (where the fn was defined) as their parent,
  // not where it was called — that's what makes closures work correctly.
  constructor(private parent?: Environment) {}


  // Create a brand-new variable in THIS scope.
  // Used when we see a "let" declaration, a function definition, or a function parameter.
  // Does NOT walk up to the parent — this always writes to the current scope.
  define(name: string, value: unknown) {
    this.values.set(name, value);
  }


  // Read the value of a variable by name.
  // Starts in the current scope and climbs the parent chain until it finds the name.
  // Throws a runtime error if the name is never found anywhere in the chain.
  get(name: string): unknown {
    if (this.values.has(name)) {
      return this.values.get(name);
    }
    if (this.parent) {
      return this.parent.get(name);
    }
    throw new Error(`Undefined variable '${name}'.`);
  }


  // Update an existing variable — used when the program does  x = x + 1;
  // Climbs the parent chain to find where the variable was originally declared,
  // then updates it there. This means inner functions can modify outer variables.
  // Throws if the variable was never declared anywhere in the chain.
  set(name: string, value: unknown): void {
    if (this.values.has(name)) {
      this.values.set(name, value);
      return;
    }
    if (this.parent) {
      this.parent.set(name, value);
      return;
    }
    throw new Error(`Undefined variable '${name}'. Use 'let' to declare it first.`);
  }


  // Returns a plain object copy of just the current scope's variables.
  // Used by the web IDE's "Env" debug tab to show what's in the global scope
  // after the program finishes running.
  dump() {
    return Object.fromEntries(this.values.entries());
  }
}