// Bun test preload. Registered via `preload` in bunfig.toml [test].
//
// Bun 1.3.x dropped `hasOwnProperty` from `process.env`, but
// @asciidoctor/opal-runtime calls `process.env.hasOwnProperty(name)`
// while initializing the converter — so every asciidoc render throws
// `process.env.hasOwnProperty is not a function` and the convertAdoc
// suite fails under `bun test`. Restore the method (non-enumerable so
// it never leaks into env iteration) before any test loads asciidoctor.
if (typeof (process.env as Record<string, unknown>).hasOwnProperty !== "function") {
  Object.defineProperty(process.env, "hasOwnProperty", {
    value: Object.prototype.hasOwnProperty,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}
