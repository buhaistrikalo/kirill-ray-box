# Ray Tools

A small Raycast extension for focused, independent tools that make everyday work faster.

> Early-stage project. The extension is useful today, but the API and feature set may evolve.

## Features

### Translate Text

Translate selected text, clipboard contents, or text entered directly in Raycast. Russian and English are detected automatically and the direction is switched:

- `ru → en`
- `en → ru`

## Privacy and configuration

- Translation text is sent over HTTPS to Google's public translation endpoint.
- The extension does not persist translation history or store user text locally.
- The current provider does not require an API key or any environment variables.
- Do not put credentials into source code or a `.env` file and assume they are hidden. A Raycast extension is client-side code, so a secret bundled into it can be extracted. An authenticated provider should use Raycast keychain-backed preferences or a server-side proxy instead.

Do not send confidential or regulated data through the current public provider.

## Requirements

- macOS
- [Raycast](https://www.raycast.com/)
- Node.js 22+ and pnpm 10+ for development

## Local development

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

`pnpm-lock.yaml` is the source of truth for dependency installation. The repository also keeps `package-lock.json` because the current Raycast CLI validates its presence during `ray lint`; contributors should still use pnpm for installs and updates.

Run the extension in Raycast while developing:

```bash
pnpm run dev
```

The `check` script runs the complete local quality gate:

1. unit tests;
2. TypeScript type checking;
3. ESLint and Prettier through Raycast's linter;
4. a production extension build.

## Architecture

Each tool lives under `src/tools/<tool-name>` and is split into:

- **domain** — pure language and request/response rules, with no Raycast imports;
- **providers** — external integrations behind a small interface;
- **UI command** — the Raycast adapter in `src/commands`.

Shared infrastructure belongs in `src/shared`. New tools should add their own directory and manifest command without importing another tool's UI or provider. This keeps tools independently replaceable and makes it possible to add another translation backend without changing the user flow.

## Translation backend

The first version uses Google's public translation endpoint with automatic source-language detection. The endpoint is isolated behind `TranslationProvider`, so it can be replaced with an authenticated or self-hosted provider later without changing the user flow.

The public endpoint may be rate-limited or change without notice. It is intentionally treated as a replaceable provider rather than a guaranteed production API.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and pull request expectations. Ideas and planned improvements are tracked in [IDEA.md](IDEA.md).

## Security

Please read [SECURITY.md](SECURITY.md) before reporting a vulnerability. Never publish credentials, private keys, personal data, or confidential translation samples in an issue.

## License

This project is released under the [MIT License](LICENSE).
