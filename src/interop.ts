// Ledger's transports ship CJS with `__esModule` set and a default export.
// Depending on the loader (Node's ESM-from-CJS rules, a bundler, our own CJS
// build), a default import yields either the class or the module object that
// wraps it, so take the class out of the wrapper when there is one.
export const interopDefault = <T>(value: T): T => {
  const inner = (value as {
    default?: T
  } | null)?.default;
  return typeof value !== "function" && inner !== undefined ? inner : value;
};
