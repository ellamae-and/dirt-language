export function registerBuiltins(env) {
    env.define("print", (...args) => {
        console.log(...args);
        return null;
    });
}
