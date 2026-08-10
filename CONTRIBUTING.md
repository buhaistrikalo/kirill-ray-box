# Contributing

Thanks for helping improve Ray Tools.

## Development setup

1. Install Node.js 22 or newer.
2. Enable Corepack with `corepack enable`.
3. Install dependencies with `pnpm install --frozen-lockfile`.
4. Run the complete local quality gate:

   ```bash
   pnpm run check
   ```

5. Run `pnpm run dev` to load the extension in Raycast while developing.

## Project conventions

- Keep tools independent under `src/tools/<tool-name>`.
- Keep domain logic free of Raycast imports.
- Put external integrations behind a small provider interface.
- Add or update unit tests for behavior changes.
- Do not commit `.env` files, credentials, private keys, personal data, or confidential translation samples.

## Pull requests

- Explain what changed and why.
- Keep changes focused and avoid unrelated reformatting.
- Include the commands used to verify the change, normally `pnpm run check`.
- Make sure the CI checks pass before requesting review.

For security issues, follow [SECURITY.md](SECURITY.md) instead of opening a public issue.
