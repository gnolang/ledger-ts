import {
  expect,
  it,
} from "vitest";

import {
  interopDefault,
} from "./interop";

it("interopDefault unwraps a module object but not a class", () => {
  class Transport {}
  expect(interopDefault(Transport)).toBe(Transport);
  expect(interopDefault({
    default: Transport,
  })).toBe(Transport);
  expect(interopDefault({
    __esModule: true,
    default: Transport,
  })).toBe(Transport);
});
