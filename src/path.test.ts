import {
  describe,
  expect,
  it,
} from "vitest";

import {
  encodePath,
  gnoPath,
  HARDENED,
  parsePath,
  validatePath,
} from "./path";

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

describe("path", () => {
  it("parses string paths with any hardened marker", () => {
    const expected = [44 + HARDENED, 118 + HARDENED, 3 + HARDENED, 0, 9];
    expect(parsePath("m/44'/118'/3'/0/9")).toEqual(expected);
    expect(parsePath("44h/118H/3'/0/9")).toEqual(expected);
    expect(parsePath(" M/44'/118'/3'/0/9 ")).toEqual(expected);
  });

  it("rejects malformed strings", () => {
    expect(() => parsePath("m/44'//0")).toThrow();
    expect(() => parsePath("m")).toThrow();
    expect(() => parsePath("m/44'/x")).toThrow("component");
    expect(() => parsePath("m/2147483648")).toThrow(RangeError);
  });

  it("gnoPath", () => {
    expect(gnoPath()).toBe("m/44'/118'/0'/0/0");
    expect(gnoPath(1, 5)).toBe("m/44'/118'/1'/0/5");
    expect(() => gnoPath(-1)).toThrow(RangeError);
    expect(() => gnoPath(0, 1.5)).toThrow(RangeError);
  });

  it("validates the shape the app accepts", () => {
    expect(() => validatePath("m/44'/118'/0'/0")).toThrow("5 components");
    expect(() => validatePath("m/43'/118'/0'/0/0")).toThrow("purpose");
    expect(() => validatePath("m/44'/118/0'/0/0")).toThrow("coin type");
    expect(() => validatePath("m/44'/118'/0/0/0")).toThrow("account must be hardened");
    expect(() => validatePath("m/44'/118'/0'/1/0")).toThrow("change");
    expect(() => validatePath("m/44'/118'/0'/0/0'")).toThrow("index");
    expect(() => validatePath([0x8000002c, 0x80000076, 0x80000000, 0, -1])).toThrow(RangeError);
  });

  it("encodes count then big-endian components", () => {
    expect(hex(encodePath("m/44'/118'/0'/0/0"))).toBe("058000002c80000076800000000000000000000000");
    expect(hex(encodePath(gnoPath(0x7fffffff, 0x7fffffff)))).toBe("058000002c80000076ffffffff000000007fffffff");
  });
});
