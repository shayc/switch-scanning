# Contributing

Thanks for your interest in contributing to `@shayc/switch-scanning`.

## Reporting issues

Open an issue at
[github.com/shayc/switch-scanning/issues](https://github.com/shayc/switch-scanning/issues).
Please include the browser and React version, scanning style, input method, and a
minimal reproduction when possible. For timing or switch-gesture bugs, include
the relevant interval, dwell, hold, and repeat settings.

## Development

Requires Node 22+.

```sh
npm install
```

Common commands:

```sh
npm run lint           # ESLint, including the Rules of Hooks
npm run format:check   # Prettier check
npm run typecheck      # TypeScript without emitting
npm test               # Vitest in jsdom
npm run test:coverage  # Coverage with regression thresholds
npm run build          # ESM, declarations, source maps, and stylesheet
npm run publint        # Validate the packed library shape
```

## Pull requests

Any user-facing feature, fix, breaking change, or dependency change that affects
consumers must include a changeset:

```sh
npm run changeset
```

Choose patch, minor, or major and write a short consumer-facing summary. Pure
refactors, documentation, tests, and CI changes do not need a changeset.
