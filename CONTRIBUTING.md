# Contributing to `@gnolang/ledger-ts`

Thanks for your interest in contributing! This document covers the bits that aren't obvious from the code — primarily our release flow.

## Development setup

```bash
pnpm install
pnpm build
pnpm test
pnpm lint
```

## Testing against a device

The unit tests drive the client through a scripted transport, so they need no hardware. To try a change on a real device (or on [Speculos](https://github.com/LedgerHQ/speculos)), build and use the `node` entry point with the Gno.land app open:

```bash
pnpm build
node -e "
const { connectNodeHid } = require('./dist/node.cjs');
(async () => {
  const ledger = await connectNodeHid();
  console.log(await ledger.getVersion(), await ledger.getPublicKey());
  await ledger.close();
})();
"
```

The wire protocol is specified in [`docs/APDU.md`](https://github.com/gnolang/ledger-app-gno/blob/main/docs/APDU.md) of the app repository; keep `src/constants.ts` in step with it.

## Releasing: Changesets

Versioning, changelog generation, git tagging, and npm publishing are all driven by [Changesets](https://github.com/changesets/changesets). You should not edit `CHANGELOG.md`, bump the version in `package.json`, or run `npm publish` by hand.

### Adding a changeset to your PR

Any PR that affects the published package must include a changeset. PRs that only touch internal tooling (CI, contributor docs, tests not exposed via the build) do not need one.

From the repo root:

```bash
pnpm changeset
```

The CLI will prompt you to:

1. Pick a bump type — `patch` for bug fixes, `minor` for backwards-compatible features, `major` for breaking changes. Follow [Semantic Versioning](https://semver.org/).
2. Write a short summary. The summary becomes the bullet point in the published changelog, so write it for end users — describe the user-facing change, not the implementation. Markdown is supported.

This creates a Markdown file under `.changeset/` (e.g. `.changeset/quiet-pandas-jump.md`). Commit it as part of your PR.

If you forget, you can also create the file manually:

```markdown
---
"@gnolang/ledger-ts": patch
---

Short, user-facing description of the change.
```

### How releases happen

The `Release` GitHub Actions workflow (`.github/workflows/release.yaml`) runs on every push to `main`:

- **If there are pending changesets in `.changeset/`**, the workflow opens (or updates) a PR titled **"chore: version packages"**. That PR consumes the changesets, bumps `package.json`, and writes the new entries into `CHANGELOG.md`.
- **When that PR is merged**, the workflow runs again, sees no pending changesets, and instead builds the package, publishes it to npm, and pushes a git tag for the new version.

In short: **you write the changeset, the bot does the rest.** Maintainers review the version PR like any other PR before merging.

### Useful local commands

```bash
# Add a changeset interactively
pnpm changeset

# See which changesets are pending and what version bump they imply
pnpm changeset:status

# Apply pending changesets locally (bumps package.json, updates CHANGELOG.md, deletes consumed changesets).
# You normally don't run this manually — the release workflow does it via the version PR.
pnpm version:packages

# Build and publish to npm. Also bot-only in normal flow.
pnpm release
```

### Repo secrets required

The release workflow needs an `NPM_TOKEN` repository secret (an npm automation token with publish rights to `@gnolang/ledger-ts`). `GITHUB_TOKEN` is provided automatically.

## Pull requests

- Keep PRs focused — one logical change per PR.
- Run `pnpm lint` and `pnpm test` before pushing.
- Include a changeset (see above) unless your change does not affect published output.
