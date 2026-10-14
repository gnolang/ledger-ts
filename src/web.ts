import TransportWebHIDImport from "@ledgerhq/hw-transport-webhid";
import TransportWebUSBImport from "@ledgerhq/hw-transport-webusb";

import {
  GnoLedger,
} from "./client";
import {
  interopDefault,
} from "./interop";

const TransportWebHID = interopDefault(TransportWebHIDImport);
const TransportWebUSB = interopDefault(TransportWebUSBImport);

/**
 * Connects to a Ledger device over WebHID (Chromium-based browsers). Reuses a
 * device the page was already granted, or shows the browser's device picker,
 * which needs a user gesture (e.g. call this from a click handler).
 * Requires the optional peer dependency `@ledgerhq/hw-transport-webhid`.
 */
export const connectWebHid = async (): Promise<GnoLedger> => {
  const transport = await TransportWebHID.create();
  return new GnoLedger(transport);
};

/**
 * Connects to a Ledger device over WebUSB. Same picker rules as `connectWebHid`.
 * Requires the optional peer dependency `@ledgerhq/hw-transport-webusb`.
 */
export const connectWebUsb = async (): Promise<GnoLedger> => {
  const transport = await TransportWebUSB.create();
  return new GnoLedger(transport);
};

/** True when the browser exposes WebHID. */
export const isWebHidSupported = (): Promise<boolean> => TransportWebHID.isSupported();

/** True when the browser exposes WebUSB. */
export const isWebUsbSupported = (): Promise<boolean> => TransportWebUSB.isSupported();
