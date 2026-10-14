import type Transport from "@ledgerhq/hw-transport";

import {
  ADDRESS_LENGTH,
  APP_NAMES,
  CLA,
  CLA_BOLOS,
  INS,
  INS_BOLOS_GET_APP_AND_VERSION,
  MAX_CHUNK_SIZE,
  P1_PUBKEY_DISPLAY,
  P1_PUBKEY_SILENT,
  P1_SIGN_TX_FIRST,
  P1_SIGN_TX_NEXT,
  P2_SIGN_TX_LAST,
  P2_SIGN_TX_MORE,
  PUBLIC_KEY_LENGTH,
  SIGNATURE_LENGTH,
  StatusWord,
} from "./constants";
import {
  GnoLedgerError,
  GnoLedgerResponseError,
} from "./errors";
import {
  DEFAULT_PATH,
  type DerivationPath,
  encodePath,
} from "./path";

export interface AppVersion {
  major: number
  minor: number
  patch: number
}

export interface PublicKeyResponse {
  /** Compressed secp256k1 public key (33 bytes). */
  publicKey: Uint8Array
  /** Bech32 `g1...` address of the key. */
  address: string
}

export interface RunningApp {
  /** Name of the running app; `BOLOS` on the dashboard. */
  name: string
  version: string
}

export interface GetPublicKeyOptions {
  /** Show the address on the device and wait for the user to approve it. */
  confirm?: boolean
}

export interface SignTxOptions {
  /** Called after each APDU of the signing session, e.g. to drive a progress bar. */
  onProgress?: (sent: number, total: number) => void
}

export interface GnoLedgerOptions {
  /**
   * How long to keep resending an APDU the device answers `COMMAND_NOT_ACCEPTED`
   * (`0x6901`), in milliseconds. The device answers so while it is still busy
   * with the previous command, e.g. showing the status screen that follows an
   * approval, and does not process the APDU, so resending is safe. `0` disables
   * the retry. Default 10000.
   */
  busyTimeoutMs?: number
  /** Delay between those resends, in milliseconds. Default 250. */
  busyRetryIntervalMs?: number
}

const decoder = new TextDecoder();
const encoder = new TextEncoder();

/**
 * Client for the Gno.land Ledger app over any `@ledgerhq/hw-transport` transport.
 *
 * Commands are serialized: a call waits for the previous one to finish, so the
 * APDUs of a signing session can never interleave with another command (which
 * would close the session on the device).
 */
export class GnoLedger {
  private queue: Promise<unknown> = Promise.resolve();

  private readonly busyTimeoutMs: number;

  private readonly busyRetryIntervalMs: number;

  constructor(readonly transport: Transport, options: GnoLedgerOptions = {
  }) {
    this.busyTimeoutMs = options.busyTimeoutMs ?? 10_000;
    this.busyRetryIntervalMs = options.busyRetryIntervalMs ?? 250;
  }

  /** Version of the Gno.land app. */
  getVersion(): Promise<AppVersion> {
    return this.serialize(async () => {
      const data = await this.exchange(CLA, INS.GET_VERSION, 0, 0);
      if (data.length !== 3) {
        throw new GnoLedgerResponseError(`GET_VERSION: expected 3 bytes, got ${data.length}`);
      }
      return {
        major: data[0]!,
        minor: data[1]!,
        patch: data[2]!,
      };
    });
  }

  /** Name reported by the app: `Gno.land` (`Gno` on builds from before the rename). */
  getAppName(): Promise<string> {
    return this.serialize(async () => decoder.decode(await this.exchange(CLA, INS.GET_APP_NAME, 0, 0)));
  }

  /**
   * Public key and `g1` address for a path. With `confirm`, the device shows the
   * address first and a rejection throws a `GnoLedgerError` with `DENY`.
   */
  async getPublicKey(path: DerivationPath = DEFAULT_PATH, options: GetPublicKeyOptions = {
  }): Promise<PublicKeyResponse> {
    const encoded = encodePath(path);
    const p1 = options.confirm ? P1_PUBKEY_DISPLAY : P1_PUBKEY_SILENT;
    return this.serialize(async () => parsePublicKey(await this.exchange(CLA, INS.GET_PUBLIC_KEY, p1, 0, encoded)));
  }

  /** Shows the address for a path on the device for the user to verify; same as `getPublicKey` with `confirm`. */
  showAddress(path: DerivationPath = DEFAULT_PATH): Promise<PublicKeyResponse> {
    return this.getPublicKey(path, {
      confirm: true,
    });
  }

  /**
   * Signs a gno sign doc: the bytes `std.GetSignaturePayload` returns, i.e. the
   * sorted, compact amino JSON of the transaction. A string is encoded as UTF-8.
   * It must be byte for byte what gno renders, or the device refuses it with
   * `TX_PARSING_FAIL`.
   *
   * Resolves once the user approves the review on the device, with the 64-byte
   * `R | S` signature (low S) over `SHA-256(payload)`, the form tm2 verifies.
   */
  async signTx(path: DerivationPath, payload: Uint8Array | string, options: SignTxOptions = {
  }): Promise<Uint8Array> {
    const encodedPath = encodePath(path);
    const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
    if (bytes.length === 0) {
      throw new Error("signTx: payload is empty");
    }
    const chunks = chunk(bytes, MAX_CHUNK_SIZE);
    const total = chunks.length + 1;
    return this.serialize(async () => {
      await this.exchange(CLA, INS.SIGN_TX, P1_SIGN_TX_FIRST, P2_SIGN_TX_MORE, encodedPath);
      options.onProgress?.(1, total);
      let signature: Uint8Array = new Uint8Array();
      for (const [i, c] of chunks.entries()) {
        const last = i === chunks.length - 1;
        const data = await this.exchange(CLA, INS.SIGN_TX, P1_SIGN_TX_NEXT, last ? P2_SIGN_TX_LAST : P2_SIGN_TX_MORE, c);
        options.onProgress?.(i + 2, total);
        if (last) {
          signature = data;
        }
      }
      if (signature.length !== SIGNATURE_LENGTH) {
        throw new GnoLedgerResponseError(`SIGN_TX: expected a ${SIGNATURE_LENGTH}-byte signature, got ${signature.length}`);
      }
      return signature;
    });
  }

  /**
   * Name and version of the app currently running on the device (`BOLOS` on the
   * dashboard). This is a device OS command, so it works whichever app is open.
   */
  getRunningApp(): Promise<RunningApp> {
    return this.serialize(async () => parseRunningApp(await this.exchange(CLA_BOLOS, INS_BOLOS_GET_APP_AND_VERSION, 0, 0)));
  }

  /** True when the Gno.land app (under its current or former name) is the one running on the device. */
  async isAppOpen(): Promise<boolean> {
    return APP_NAMES.includes((await this.getRunningApp()).name);
  }

  /** Closes the underlying transport. */
  close(): Promise<void> {
    return this.transport.close();
  }

  /**
   * Sends one APDU and returns its data, throwing `GnoLedgerError` on any status
   * word but `0x9000`. Resends while the device answers `COMMAND_NOT_ACCEPTED`,
   * up to `busyTimeoutMs`.
   */
  private async exchange(cla: number, ins: number, p1: number, p2: number, data: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    if (data.length > MAX_CHUNK_SIZE) {
      throw new RangeError(`APDU data is ${data.length} bytes, over the ${MAX_CHUNK_SIZE}-byte limit`);
    }
    const apdu = Buffer.alloc(5 + data.length);
    apdu.set([cla, ins, p1, p2, data.length]);
    apdu.set(data, 5);
    const deadline = Date.now() + this.busyTimeoutMs;
    let response: Buffer;
    let sw: number;
    for (;;) {
      response = await this.transport.exchange(apdu);
      if (response.length < 2) {
        throw new GnoLedgerResponseError(`Response of ${response.length} bytes has no status word`);
      }
      sw = (response[response.length - 2]! << 8) | response[response.length - 1]!;
      if (sw !== StatusWord.COMMAND_NOT_ACCEPTED || Date.now() + this.busyRetryIntervalMs > deadline) {
        break;
      }
      await new Promise(resolve => setTimeout(resolve, this.busyRetryIntervalMs));
    }
    if (sw !== StatusWord.OK) {
      throw new GnoLedgerError(sw);
    }
    // Copy into a plain Uint8Array: callers should not get the transport's Buffer.
    return new Uint8Array(response.subarray(0, response.length - 2));
  }

  private serialize<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

/** Splits bytes into chunks of at most `size` bytes. */
export const chunk = (bytes: Uint8Array, size: number): Uint8Array[] => {
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) {
    out.push(bytes.subarray(i, i + size));
  }
  return out;
};

/** Parses a GET_PUBLIC_KEY response: `33 | pubkey (33) | 40 | address (40)`. */
export const parsePublicKey = (data: Uint8Array): PublicKeyResponse => {
  const expected = 1 + PUBLIC_KEY_LENGTH + 1 + ADDRESS_LENGTH;
  if (data.length !== expected || data[0] !== PUBLIC_KEY_LENGTH || data[1 + PUBLIC_KEY_LENGTH] !== ADDRESS_LENGTH) {
    throw new GnoLedgerResponseError(`GET_PUBLIC_KEY: malformed response of ${data.length} bytes`);
  }
  return {
    publicKey: data.slice(1, 1 + PUBLIC_KEY_LENGTH),
    address: decoder.decode(data.subarray(2 + PUBLIC_KEY_LENGTH)),
  };
};

/** Parses a BOLOS GET_APP_AND_VERSION response: `format (1) | len | name | len | version | ...`. */
export const parseRunningApp = (data: Uint8Array): RunningApp => {
  if (data.length < 2 || data[0] !== 1) {
    throw new GnoLedgerResponseError("GET_APP_AND_VERSION: unknown response format");
  }
  const nameLength = data[1]!;
  const versionLength = data[2 + nameLength];
  if (versionLength === undefined || data.length < 3 + nameLength + versionLength) {
    throw new GnoLedgerResponseError("GET_APP_AND_VERSION: truncated response");
  }
  return {
    name: decoder.decode(data.subarray(2, 2 + nameLength)),
    version: decoder.decode(data.subarray(3 + nameLength, 3 + nameLength + versionLength)),
  };
};
