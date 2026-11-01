# Contributing

Thanks for your interest in Integration Catalog. This repository contains the React frontend; API, database, email, and AI provider changes belong in the [backend repository](https://github.com/EnginKisin/integration-catalog).

Contributions to this frontend are made under the repository's [MIT License](LICENSE).

## Reporting a bug

Include the steps to reproduce, expected and actual behavior, browser/version, and whether the issue occurs with a real backend or mocked tests. For an API failure, include the stable error code and request ID where available.

Use sanitized examples. Keep passwords, session cookies, account-action tokens, integration credentials, private endpoint URLs, and real payload data out of public issues, logs, screenshots, and traces. For a sensitive security report, establish a private contact with the maintainer before sharing details publicly.

## Proposing a change

Explain the user-facing problem and the expected behavior. For a change to API interaction, link the relevant backend contract and describe any compatibility effect. Discuss large workflow or visual changes before starting them.

## Working locally

Follow the [README](README.md#getting-started) and [development guide](docs/DEVELOPMENT.md). Use Node.js 24 and `npm ci` to install from the lockfile.

Keep changes focused, reuse the existing UI components and styles, and preserve mobile and keyboard interaction. UI text is currently Turkish; developer documentation is English. Backend error text belongs in the central code-based localization dictionary.

Preserve session/CSRF handling, explicit confirmation for consequential account actions, credential-reveal boundaries, and the existing behavior for uncertain writes. Document any intentional change to these flows.

## Verification

Run checks appropriate to the change:

```sh
npm test
npm run lint
npm run build
```

For changes to forms, navigation, permissions, mapping, or diagrams, run the affected browser scenarios:

```sh
npx playwright install chromium --only-shell
npm run test:e2e
```

Add or update tests when behavior changes. Avoid tests that simply repeat implementation details. Browser tests use intercepted API responses; document any additional verification against a live backend.

## Pull request description

Describe the problem, resulting behavior, and relevant validation. Include sanitized before/after screenshots for visible changes. Call out required backend changes and any remaining limitations so a reviewer can assess the result without prior conversation context.
