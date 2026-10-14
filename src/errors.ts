import {
  STATUS_MESSAGES,
  StatusWord,
} from "./constants";

const hex = (sw: number) => "0x" + sw.toString(16).toUpperCase().padStart(4, "0");

/** A command was answered with a status word other than `0x9000`. */
export class GnoLedgerError extends Error {
  override readonly name = "GnoLedgerError";

  /** The two-byte status word returned by the device. */
  readonly statusWord: number;

  /** The `StatusWord` member name, or `UNKNOWN` for a status word not listed there. */
  readonly statusName: string;

  constructor(statusWord: number) {
    const statusName = StatusWord[statusWord] ?? "UNKNOWN";
    const description = STATUS_MESSAGES[statusWord] ?? "Unknown status word";
    super(`${description} (${statusName}, ${hex(statusWord)})`);
    this.statusWord = statusWord;
    this.statusName = statusName;
  }

  /** True when the user pressed reject on the device. */
  get isUserRejection(): boolean {
    return this.statusWord === StatusWord.DENY;
  }

  /** True when the device was still busy with the previous command; the request was not processed. */
  get isBusy(): boolean {
    return this.statusWord === StatusWord.COMMAND_NOT_ACCEPTED;
  }

  /** True when the device answered from the dashboard or another app rather than the Gno.land app. */
  get isAppNotOpen(): boolean {
    return this.statusWord === StatusWord.APP_NOT_OPEN
      || this.statusWord === StatusWord.APP_NOT_OPEN_ALT
      || this.statusWord === StatusWord.CLA_NOT_SUPPORTED
      || this.statusWord === StatusWord.INS_NOT_SUPPORTED;
  }
}

/** The device answered `0x9000` but the response data is not what the protocol specifies. */
export class GnoLedgerResponseError extends Error {
  override readonly name = "GnoLedgerResponseError";
}
