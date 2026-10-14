import type Transport from "@ledgerhq/hw-transport";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";

import {
  chunk,
  GnoLedger,
  parsePublicKey,
  parseRunningApp,
} from "./client";
import {
  StatusWord,
} from "./constants";
import {
  GnoLedgerError,
  GnoLedgerResponseError,
} from "./errors";
import {
  encodePath,
} from "./path";

const sw = (word: number) => [word >> 8, word & 0xff];

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

type Handler = (apdu: Buffer) => number[] | Promise<number[]>;

/** A transport that records every APDU and answers with `handler`. */
const fakeTransport = (handler: Handler) => {
  const sent: Buffer[] = [];
  const transport = {
    exchange: vi.fn(async (apdu: Buffer) => {
      sent.push(Buffer.from(apdu));
      return Buffer.from(await handler(apdu));
    }),
    close: vi.fn(async () => undefined),
  };
  return {
    sent,
    transport,
    ledger: new GnoLedger(transport as unknown as Transport),
  };
};

const ok = (...data: number[]) => [...data, ...sw(StatusWord.OK)];

const PUBKEY = Uint8Array.from({
  length: 33,
}, (_, i) => (i === 0 ? 0x02 : i));
const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const pubkeyResponse = () => ok(33, ...PUBKEY, 40, ...Buffer.from(ADDRESS));

describe("GnoLedger", () => {
  it("getVersion", async () => {
    const {
      ledger, sent,
    } = fakeTransport(() => ok(1, 2, 3));
    await expect(ledger.getVersion()).resolves.toEqual({
      major: 1,
      minor: 2,
      patch: 3,
    });
    expect(sent.map(hex)).toEqual(["e003000000"]);
  });

  it("getVersion rejects a malformed response", async () => {
    const {
      ledger,
    } = fakeTransport(() => ok(1, 2));
    await expect(ledger.getVersion()).rejects.toBeInstanceOf(GnoLedgerResponseError);
  });

  it("getAppName", async () => {
    const {
      ledger, sent,
    } = fakeTransport(() => ok(...Buffer.from("Gno.land")));
    await expect(ledger.getAppName()).resolves.toBe("Gno.land");
    expect(sent.map(hex)).toEqual(["e004000000"]);
  });

  it("getPublicKey sends the default path silently", async () => {
    const {
      ledger, sent,
    } = fakeTransport(pubkeyResponse);
    const res = await ledger.getPublicKey();
    expect(res.publicKey).toEqual(PUBKEY);
    expect(res.address).toBe(ADDRESS);
    expect(sent.map(hex)).toEqual(["e005000015058000002c80000076800000000000000000000000"]);
  });

  it("getPublicKey with confirm sets P1 = 1, showAddress likewise", async () => {
    const {
      ledger, sent,
    } = fakeTransport(pubkeyResponse);
    await ledger.getPublicKey("m/44'/118'/2'/0/7", {
      confirm: true,
    });
    await ledger.showAddress([0x8000002c, 0x80000076, 0x80000000, 0, 0]);
    expect(sent.map(hex)).toEqual(["e005010015058000002c80000076800000020000000000000007", "e005010015058000002c80000076800000000000000000000000"]);
  });

  it("getPublicKey rejects an invalid path without talking to the device", async () => {
    const {
      ledger, transport,
    } = fakeTransport(pubkeyResponse);
    await expect(ledger.getPublicKey("m/44'/60'/0'/0/0")).rejects.toThrow("coin type");
    expect(transport.exchange).not.toHaveBeenCalled();
  });

  it("maps a rejection to GnoLedgerError", async () => {
    const {
      ledger,
    } = fakeTransport(() => sw(StatusWord.DENY));
    const err = await ledger.showAddress().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(GnoLedgerError);
    expect(err).toMatchObject({
      statusWord: 0x6985,
      statusName: "DENY",
      isUserRejection: true,
      isAppNotOpen: false,
    });
  });

  it("maps unknown status words", async () => {
    const {
      ledger,
    } = fakeTransport(() => [0x12, 0x34]);
    await expect(ledger.getAppName()).rejects.toMatchObject({
      statusWord: 0x1234,
      statusName: "UNKNOWN",
      message: "Unknown status word (UNKNOWN, 0x1234)",
    });
  });

  it("flags app-not-open status words", async () => {
    const {
      ledger,
    } = fakeTransport(() => sw(StatusWord.APP_NOT_OPEN));
    await expect(ledger.getVersion()).rejects.toMatchObject({
      isAppNotOpen: true,
    });
  });

  it("resends while the device answers COMMAND_NOT_ACCEPTED", async () => {
    let busy = 2;
    const transport = {
      exchange: vi.fn(async () => Buffer.from(busy-- > 0 ? sw(StatusWord.COMMAND_NOT_ACCEPTED) : ok(0, 1, 0))),
      close: vi.fn(),
    };
    const ledger = new GnoLedger(transport as unknown as Transport, {
      busyRetryIntervalMs: 1,
    });
    await expect(ledger.getVersion()).resolves.toEqual({
      major: 0,
      minor: 1,
      patch: 0,
    });
    expect(transport.exchange).toHaveBeenCalledTimes(3);
  });

  it("gives up on COMMAND_NOT_ACCEPTED after busyTimeoutMs", async () => {
    const transport = {
      exchange: vi.fn(async () => Buffer.from(sw(StatusWord.COMMAND_NOT_ACCEPTED))),
      close: vi.fn(),
    };
    const ledger = new GnoLedger(transport as unknown as Transport, {
      busyTimeoutMs: 30,
      busyRetryIntervalMs: 5,
    });
    await expect(ledger.getVersion()).rejects.toMatchObject({
      statusName: "COMMAND_NOT_ACCEPTED",
      isBusy: true,
    });
    expect(transport.exchange.mock.calls.length).toBeGreaterThan(1);
  });

  it("does not resend when busyTimeoutMs is 0", async () => {
    const transport = {
      exchange: vi.fn(async () => Buffer.from(sw(StatusWord.COMMAND_NOT_ACCEPTED))),
      close: vi.fn(),
    };
    const ledger = new GnoLedger(transport as unknown as Transport, {
      busyTimeoutMs: 0,
    });
    await expect(ledger.getVersion()).rejects.toBeInstanceOf(GnoLedgerError);
    expect(transport.exchange).toHaveBeenCalledOnce();
  });

  it("rejects a response without a status word", async () => {
    const {
      ledger,
    } = fakeTransport(() => [0x90]);
    await expect(ledger.getVersion()).rejects.toBeInstanceOf(GnoLedgerResponseError);
  });

  describe("signTx", () => {
    const signature = Array.from({
      length: 64,
    }, (_, i) => i);
    const path = "m/44'/118'/0'/0/0";

    it("streams the payload in 255-byte chunks after the path", async () => {
      const payload = Uint8Array.from({
        length: 600,
      }, (_, i) => i & 0xff);
      const {
        ledger, sent,
      } = fakeTransport(apdu => (apdu[3] === 0x00 ? ok(...signature) : ok()));
      const progress: [number, number][] = [];
      const sig = await ledger.signTx(path, payload, {
        onProgress: (s, t) => progress.push([s, t]),
      });

      expect(sig).toEqual(Uint8Array.from(signature));
      expect(sent).toHaveLength(4);
      expect(hex(sent[0]!)).toBe("e006008015" + hex(encodePath(path)));
      expect(hex(sent[1]!.subarray(0, 5))).toBe("e0060180ff");
      expect(hex(sent[2]!.subarray(0, 5))).toBe("e0060180ff");
      expect(hex(sent[3]!.subarray(0, 5))).toBe("e00601005a");
      expect(Buffer.concat(sent.slice(1).map(a => a.subarray(5)))).toEqual(Buffer.from(payload));
      expect(progress).toEqual([[1, 4], [2, 4], [3, 4], [4, 4]]);
    });

    it("sends a payload of exactly one chunk as the last chunk", async () => {
      const {
        ledger, sent,
      } = fakeTransport(apdu => (apdu[3] === 0x00 ? ok(...signature) : ok()));
      await ledger.signTx(path, new Uint8Array(255));
      expect(sent.map(a => hex(a.subarray(0, 5)))).toEqual(["e006008015", "e0060100ff"]);
    });

    it("encodes a string payload as UTF-8", async () => {
      const doc = "{\"memo\":\"γεια\"}";
      const {
        ledger, sent,
      } = fakeTransport(apdu => (apdu[3] === 0x00 ? ok(...signature) : ok()));
      await ledger.signTx(path, doc);
      expect(sent[1]!.subarray(5)).toEqual(Buffer.from(doc, "utf8"));
    });

    it("stops at the first error and reports its status word", async () => {
      const {
        ledger, sent,
      } = fakeTransport(apdu => (apdu[2] === 0x01 ? sw(StatusWord.TX_PARSING_FAIL) : ok()));
      await expect(ledger.signTx(path, new Uint8Array(600))).rejects.toMatchObject({
        statusName: "TX_PARSING_FAIL",
      });
      expect(sent).toHaveLength(2);
    });

    it("rejects an empty payload", async () => {
      const {
        ledger,
      } = fakeTransport(() => ok());
      await expect(ledger.signTx(path, new Uint8Array())).rejects.toThrow("empty");
    });

    it("rejects a signature of the wrong length", async () => {
      const {
        ledger,
      } = fakeTransport(() => ok(1, 2, 3));
      await expect(ledger.signTx(path, "x")).rejects.toBeInstanceOf(GnoLedgerResponseError);
    });

    it("does not interleave with commands issued meanwhile", async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const {
        ledger, sent,
      } = fakeTransport(async (apdu) => {
        if (apdu[1] === 0x06 && apdu[2] === 0x00) {
          await gate;
        }
        if (apdu[1] === 0x03) {
          return ok(0, 1, 0);
        }
        return apdu[3] === 0x00 ? ok(...signature) : ok();
      });
      const signing = ledger.signTx(path, new Uint8Array(300));
      const version = ledger.getVersion();
      release();
      await Promise.all([signing, version]);
      expect(sent.map(a => hex(a.subarray(0, 4)))).toEqual(["e0060080", "e0060180", "e0060100", "e0030000"]);
    });

    it("keeps serving commands after a failed one", async () => {
      const {
        ledger,
      } = fakeTransport(apdu => (apdu[1] === 0x06 ? sw(StatusWord.INVALID_PATH) : ok(0, 1, 0)));
      await expect(ledger.signTx(path, "x")).rejects.toBeInstanceOf(GnoLedgerError);
      await expect(ledger.getVersion()).resolves.toEqual({
        major: 0,
        minor: 1,
        patch: 0,
      });
    });
  });

  it("getRunningApp and isAppOpen", async () => {
    const response = ok(1, 8, ...Buffer.from("Gno.land"), 5, ...Buffer.from("0.1.0"), 1, 0);
    const {
      ledger, sent,
    } = fakeTransport(() => response);
    await expect(ledger.getRunningApp()).resolves.toEqual({
      name: "Gno.land",
      version: "0.1.0",
    });
    await expect(ledger.isAppOpen()).resolves.toBe(true);
    expect(hex(sent[0]!)).toBe("b001000000");
  });

  it("isAppOpen accepts the app's former name and nothing else", async () => {
    const running = (name: string) => ok(1, name.length, ...Buffer.from(name), 5, ...Buffer.from("0.1.0"));
    await expect(fakeTransport(() => running("Gno")).ledger.isAppOpen()).resolves.toBe(true);
    await expect(fakeTransport(() => running("BOLOS")).ledger.isAppOpen()).resolves.toBe(false);
    await expect(fakeTransport(() => running("Cosmos")).ledger.isAppOpen()).resolves.toBe(false);
  });

  it("close closes the transport", async () => {
    const {
      ledger, transport,
    } = fakeTransport(() => ok());
    await ledger.close();
    expect(transport.close).toHaveBeenCalledOnce();
  });
});

describe("helpers", () => {
  it("chunk", () => {
    expect(chunk(new Uint8Array(0), 255)).toEqual([]);
    expect(chunk(new Uint8Array(510), 255).map(c => c.length)).toEqual([255, 255]);
    expect(chunk(new Uint8Array(511), 255).map(c => c.length)).toEqual([255, 255, 1]);
  });

  it("parsePublicKey rejects bad length prefixes", () => {
    const good = Uint8Array.from(pubkeyResponse().slice(0, -2));
    expect(() => parsePublicKey(good)).not.toThrow();
    const bad = good.slice();
    bad[0] = 65;
    expect(() => parsePublicKey(bad)).toThrow(GnoLedgerResponseError);
    expect(() => parsePublicKey(good.subarray(0, 70))).toThrow(GnoLedgerResponseError);
  });

  it("parseRunningApp", () => {
    expect(parseRunningApp(Uint8Array.from([1, 5, ...Buffer.from("BOLOS"), 5, ...Buffer.from("1.2.3")]))).toEqual({
      name: "BOLOS",
      version: "1.2.3",
    });
    expect(() => parseRunningApp(Uint8Array.from([2, 0, 0]))).toThrow(GnoLedgerResponseError);
    expect(() => parseRunningApp(Uint8Array.from([1, 5, 0x41]))).toThrow(GnoLedgerResponseError);
  });
});
