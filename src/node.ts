import {
  createRequire,
} from "node:module";

import type TransportNodeHidType from "@ledgerhq/hw-transport-node-hid";

import {
  GnoLedger,
} from "./client";
import {
  interopDefault,
} from "./interop";

export interface ConnectNodeHidOptions {
  /** Milliseconds to wait for the device to open (default 3000). */
  openTimeout?: number
  /** Milliseconds to wait for a device to be plugged in; waits indefinitely when unset. */
  listenTimeout?: number
}

// Loaded with require, also from the ESM build: the ESM build of Ledger's
// packages (lib-es) uses extensionless relative imports, which Node's ESM
// loader cannot resolve. Loading lazily also turns a missing optional peer
// dependency into an error from the call rather than from the import.
const loadTransport = (): typeof TransportNodeHidType => {
  const require = createRequire(import.meta.url);
  try {
    return interopDefault(require("@ledgerhq/hw-transport-node-hid"));
  }
  catch (e) {
    throw new Error("@gnolang/ledger-ts/node needs the @ledgerhq/hw-transport-node-hid package installed", {
      cause: e,
    });
  }
};

/**
 * Connects to the first Ledger device found over USB (HID) from Node.js.
 * Requires the optional peer dependency `@ledgerhq/hw-transport-node-hid`.
 */
export const connectNodeHid = async (options: ConnectNodeHidOptions = {
}): Promise<GnoLedger> => {
  const transport = await loadTransport().create(options.openTimeout, options.listenTimeout);
  return new GnoLedger(transport);
};

/** Lists the HID paths of the Ledger devices currently plugged in. */
export const listNodeHidDevices = async (): Promise<string[]> => loadTransport().list();
