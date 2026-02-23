export class Environment {
    values = new Map();
    define(name, value) {
        this.values.set(name, value);
    }
    get(name) {
        if (!this.values.has(name)) {
            throw new Error(`Undefined variable '${name}'.`);
        }
        return this.values.get(name);
    }
}
