// The app accepts exactly one path shape: m/44'/118'/account'/0/index.

export const HARDENED = 0x80000000;

const PURPOSE = 44;
const COIN_TYPE = 118;
const MAX_INDEX = HARDENED - 1;

/**
 * A derivation path: a string such as `m/44'/118'/0'/0/0` (`h` or `H` also mark
 * hardened components), or the five numeric components with the hardened bit
 * already set.
 */
export type DerivationPath = string | readonly number[];

/** The default path, the first address of the first account. */
export const DEFAULT_PATH = "m/44'/118'/0'/0/0";

const assertIndex = (value: number, what: string) => {
  if (!Number.isInteger(value) || value < 0 || value > MAX_INDEX) {
    throw new RangeError(`${what} must be an integer in [0, ${MAX_INDEX}], got ${value}`);
  }
};

/** Builds the path string for an account and address index: `m/44'/118'/account'/0/index`. */
export const gnoPath = (account = 0, index = 0): string => {
  assertIndex(account, "account");
  assertIndex(index, "index");
  return `m/44'/118'/${account}'/0/${index}`;
};

const parseComponent = (part: string): number => {
  const match = /^(\d+)(['hH]?)$/.exec(part);
  if (!match) {
    throw new Error(`Invalid derivation path component "${part}"`);
  }
  const value = Number(match[1]);
  assertIndex(value, "Derivation path component");
  return match[2] ? (value | HARDENED) >>> 0 : value;
};

/** Parses a path into its numeric components (hardened bit set), without checking its shape. */
export const parsePath = (path: DerivationPath): number[] => {
  if (typeof path !== "string") {
    return [...path];
  }
  const parts = path.trim().split("/");
  if (parts[0] === "m" || parts[0] === "M") {
    parts.shift();
  }
  if (parts.length === 0 || parts.some(p => p === "")) {
    throw new Error(`Invalid derivation path "${path}"`);
  }
  return parts.map(parseComponent);
};

/**
 * Validates a path against the shape the app accepts and returns its components.
 * The device would refuse anything else with `INVALID_PATH`; checking here gives
 * a clearer error and saves a round trip.
 */
export const validatePath = (path: DerivationPath): number[] => {
  const components = parsePath(path);
  if (components.length !== 5) {
    throw new Error(`Derivation path must have 5 components (m/44'/118'/account'/0/index), got ${components.length}`);
  }
  const [purpose, coinType, account, change, index] = components as [number, number, number, number, number];
  for (const c of components) {
    if (!Number.isInteger(c) || c < 0 || c > 0xffffffff) {
      throw new RangeError(`Derivation path component ${c} is not a uint32`);
    }
  }
  if (purpose !== (PURPOSE | HARDENED) >>> 0) {
    throw new Error("Derivation path purpose must be 44'");
  }
  if (coinType !== (COIN_TYPE | HARDENED) >>> 0) {
    throw new Error("Derivation path coin type must be 118'");
  }
  if (account < HARDENED) {
    throw new Error("Derivation path account must be hardened");
  }
  if (change !== 0) {
    throw new Error("Derivation path change must be 0");
  }
  if (index >= HARDENED) {
    throw new Error("Derivation path index must not be hardened");
  }
  return components;
};

/** Serializes a path for the wire: `count (1) | component (4, big-endian) x count`. */
export const encodePath = (path: DerivationPath): Uint8Array => {
  const components = validatePath(path);
  const out = new Uint8Array(1 + 4 * components.length);
  const view = new DataView(out.buffer);
  out[0] = components.length;
  components.forEach((c, i) => view.setUint32(1 + 4 * i, c, false));
  return out;
};
