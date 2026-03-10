export class Environment {

    // stores variable names and their values
    private values = new Map<string, unknown>();
  
    // it adds a name and value to memory
    define(name: string, value: unknown) {
      this.values.set(name, value);
    }
  
    // retrieves a variable's value
    get(name: string): unknown {
      if (!this.values.has(name)) {
        throw new Error(`Undefined variable '${name}'.`);
      }
      return this.values.get(name);
    }
  
     //create a display-friendly view of runtime memory
  dump(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [k, v] of this.values.entries()) {
      if (typeof v === "function") out[k] = "<native function>";
      else if (typeof v === "string") out[k] = JSON.stringify(v);
      else out[k] = String(v);
    }
    return out;
  }
}