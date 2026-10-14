// Wire constants of the Gno.land Ledger app (ledger-app-gno, docs/APDU.md).

export const CLA = 0xe0;

export const INS = {
  GET_VERSION: 0x03,
  GET_APP_NAME: 0x04,
  GET_PUBLIC_KEY: 0x05,
  SIGN_TX: 0x06,
} as const;

export const P1_PUBKEY_SILENT = 0x00;
export const P1_PUBKEY_DISPLAY = 0x01;
export const P1_SIGN_TX_FIRST = 0x00;
export const P1_SIGN_TX_NEXT = 0x01;
export const P2_SIGN_TX_LAST = 0x00;
export const P2_SIGN_TX_MORE = 0x80;

// BOLOS (device OS) commands, answered by the dashboard and by every app.
export const CLA_BOLOS = 0xb0;
export const INS_BOLOS_GET_APP_AND_VERSION = 0x01;
export const INS_BOLOS_QUIT_APP = 0xa7;
export const INS_BOLOS_OPEN_APP = 0xd8;

/** Largest data field of a short APDU, and the size of each SIGN_TX payload chunk. */
export const MAX_CHUNK_SIZE = 255;

export const PUBLIC_KEY_LENGTH = 33;
export const ADDRESS_LENGTH = 40;
export const SIGNATURE_LENGTH = 64;

/** Name of the app, as GET_APP_NAME and the device OS report it. */
export const APP_NAME = "Gno.land";

/** Names the app has been released under: `Gno.land`, and `Gno` before it was renamed. */
export const APP_NAMES: readonly string[] = [APP_NAME, "Gno"];

/** Status words returned by the Gno.land app, plus the device-level ones a client commonly meets. */
export enum StatusWord {
  OK = 0x9000,
  DENY = 0x6985,
  WRONG_P1P2 = 0x6a86,
  INS_NOT_SUPPORTED = 0x6d00,
  CLA_NOT_SUPPORTED = 0x6e00,
  WRONG_APDU_LENGTH = 0x6e03,
  COMM_ERROR = 0x6f00,
  ADDR_DISPLAY_FAIL = 0xb002,
  TX_PARSING_FAIL = 0xb005,
  TX_SIGN_FAIL = 0xb008,
  KEY_DERIVE_FAIL = 0xb009,
  VERSION_PARSING_FAIL = 0xb00a,
  INVALID_PATH = 0xb00b,
  TX_NO_SESSION = 0xb00c,
  TX_WRONG_SIGNER = 0xb00d,
  TX_TOO_LARGE = 0xb00e,
  PACKAGE_TX_DISABLED = 0xb00f,
  // Device level: not sent by the app's handlers.
  /** Sent by the SDK while the app is still busy with the previous command (e.g. a status screen). */
  COMMAND_NOT_ACCEPTED = 0x6901,
  DEVICE_LOCKED = 0x5515,
  APP_NOT_OPEN = 0x6511,
  APP_NOT_OPEN_ALT = 0x6e01,
  APP_NOT_INSTALLED = 0x6807,
}

export const STATUS_MESSAGES: Readonly<Record<number, string>> = {
  [StatusWord.OK]: "Success",
  [StatusWord.DENY]: "The user rejected the request on the device",
  [StatusWord.WRONG_P1P2]: "Invalid P1/P2 for the instruction",
  [StatusWord.INS_NOT_SUPPORTED]: "Unknown instruction (is the Gno.land app open?)",
  [StatusWord.CLA_NOT_SUPPORTED]: "Wrong CLA (is the Gno.land app open?)",
  [StatusWord.WRONG_APDU_LENGTH]: "Malformed data length",
  [StatusWord.COMM_ERROR]: "Communication error",
  [StatusWord.ADDR_DISPLAY_FAIL]: "The address could not be displayed",
  [StatusWord.TX_PARSING_FAIL]: "The payload is not an accepted gno sign doc",
  [StatusWord.TX_SIGN_FAIL]: "Signing failed",
  [StatusWord.KEY_DERIVE_FAIL]: "Key derivation failed",
  [StatusWord.VERSION_PARSING_FAIL]: "The app version could not be encoded",
  [StatusWord.INVALID_PATH]: "The path is outside m/44'/118'/a'/0/i",
  [StatusWord.TX_NO_SESSION]: "A payload chunk arrived without an open signing session",
  [StatusWord.TX_WRONG_SIGNER]: "A message is signed by an address other than the device's",
  [StatusWord.TX_TOO_LARGE]: "A displayed value or the review exceeds device limits",
  [StatusWord.PACKAGE_TX_DISABLED]:
    "The Packages setting is off and the payload can run code (enable it in the app settings)",
  [StatusWord.COMMAND_NOT_ACCEPTED]: "The device is still busy with the previous command",
  [StatusWord.DEVICE_LOCKED]: "The device is locked",
  [StatusWord.APP_NOT_OPEN]: "The Gno.land app is not open on the device",
  [StatusWord.APP_NOT_OPEN_ALT]: "The Gno.land app is not open on the device",
  [StatusWord.APP_NOT_INSTALLED]: "The app is not installed on the device",
};
