# @gnolang/ledger-ts

TypeScript client for the [Gno.land Ledger app](https://github.com/gnolang/ledger-app-gno).
It connects to a Ledger device over USB and exposes the app's APDU commands as
typed async methods.

- **Every app command**: version, app name, public key and `g1` address (silent or
  confirmed on screen), and transaction signing, streamed in chunks.
- **Any transport.** `GnoLedger` takes any [`@ledgerhq/hw-transport`](https://www.npmjs.com/package/@ledgerhq/hw-transport)
  transport. Helpers connect over node-hid (Node.js) or WebHID/WebUSB (browsers).
- **Safe to share.** Calls are serialized, so a signing session's APDUs never
  interleave with another command.
- **Typed errors.** Status words become `GnoLedgerError`s with a name and an
  explanation, e.g. `isUserRejection` or `isAppNotOpen`.
- Ships ESM and CJS.

## Install

```sh
npm install @gnolang/ledger-ts
```

Install the transport for your platform alongside it (these are optional peer
dependencies):

```sh
npm install @ledgerhq/hw-transport-node-hid   # Node.js
npm install @ledgerhq/hw-transport-webhid     # browsers (Chrome, Edge, ...)
npm install @ledgerhq/hw-transport-webusb     # browsers, WebUSB alternative
```

## Usage

```ts
import { gnoPath } from "@gnolang/ledger-ts";
import { connectNodeHid } from "@gnolang/ledger-ts/node";

const ledger = await connectNodeHid();

try {
  await ledger.getVersion();    // { major: 0, minor: 1, patch: 0 }
  await ledger.getAppName();    // "Gno.land"

  // Public key and address, without user interaction
  const { publicKey, address } = await ledger.getPublicKey(gnoPath(0, 0));
  // publicKey: Uint8Array(33), compressed secp256k1
  // address:   "g1..."

  // Show the address on the device and wait for the user to approve it
  await ledger.showAddress(gnoPath(0, 0));

  // Sign: the payload is the sign doc std.GetSignaturePayload renders
  // (sorted, compact amino JSON), as bytes or a string
  const signature = await ledger.signTx(gnoPath(0, 0), signBytes);
  // Uint8Array(64): R | S, low S, over SHA-256(payload), the form tm2 verifies
} finally {
  await ledger.close();
}
```

In the browser, connect from a user gesture so the device picker can open:

```ts
import { connectWebHid } from "@gnolang/ledger-ts/web";

button.onclick = async () => {
  const ledger = await connectWebHid();
  console.log(await ledger.getPublicKey());
};
```

Ledger's transports expect a global `Buffer` in the browser. If your bundler
does not provide one, polyfill it, e.g. with the [`buffer`](https://www.npmjs.com/package/buffer)
package: `globalThis.Buffer = Buffer`.

Any other transport works too: `new GnoLedger(transport)`.

### Derivation paths

The app accepts only `m/44'/118'/account'/0/index`. Pass a path as a string
(`"m/44'/118'/0'/0/3"`, with `'`, `h` or `H` marking hardened components), as
the five numeric components, or build it with `gnoPath(account, index)`.
Paths are checked before anything is sent to the device. `getPublicKey` and
`showAddress` default to `m/44'/118'/0'/0/0`.

### Signing

`signTx` sends the path, then the payload in 255-byte chunks, and resolves once
the user approves the review on the device. The payload must be exactly the
bytes gno renders for the transaction. Anything else is refused with
`TX_PARSING_FAIL`. Pass `onProgress` to follow the upload of large payloads,
such as `m_addpkg`:

```ts
await ledger.signTx(path, signBytes, {
  onProgress: (sent, total) => console.log(`${sent}/${total}`),
});
```

`m_addpkg` and `m_run` (and sessions allowing `vm/run`) are refused with
`PACKAGE_TX_DISABLED` unless the Packages setting is enabled in the app. For
these messages the device shows a fingerprint of the package files. See
[the app's APDU documentation](https://github.com/gnolang/ledger-app-gno/blob/main/docs/APDU.md#package-fingerprint)
for how to compute the fingerprint and compare it.

### Errors

```ts
import { GnoLedgerError, StatusWord } from "@gnolang/ledger-ts";

try {
  await ledger.signTx(path, signBytes);
} catch (e) {
  if (e instanceof GnoLedgerError) {
    if (e.isUserRejection) { /* the user pressed reject */ }
    else if (e.isAppNotOpen) { /* ask the user to open the Gno.land app */ }
    else if (e.statusWord === StatusWord.DEVICE_LOCKED) { /* ask to unlock */ }
    console.error(e.statusName, e.message);
  }
}
```

`GnoLedgerResponseError` means the device answered `0x9000` with data that
does not match the protocol. Transport failures, such as a disconnected device,
are thrown as Ledger's own transport errors.

### Device state

`getRunningApp()` returns the name and version of the app running on the device
(`BOLOS` on the dashboard). `isAppOpen()` tells you whether that app is Gno.land. It also accepts `Gno`, the
name of builds from before the app was renamed.

## API

| Method | APDU | Returns |
| --- | --- | --- |
| `getVersion()` | `E0 03` | `{ major, minor, patch }` |
| `getAppName()` | `E0 04` | `string` |
| `getPublicKey(path?, { confirm? })` | `E0 05` | `{ publicKey, address }` |
| `showAddress(path?)` | `E0 05`, P1 = 1 | `{ publicKey, address }` |
| `signTx(path, payload, { onProgress? })` | `E0 06`, streamed | `Uint8Array(64)` |
| `getRunningApp()` | `B0 01` | `{ name, version }` |
| `isAppOpen()` | `B0 01` | `boolean` |
| `close()` | | |

The low-level pieces are exported too: `encodePath`, `parsePath`,
`validatePath`, `chunk`, `parsePublicKey`, and the `CLA`, `INS` and
`StatusWord` constants.

## License

Apache-2.0
