# ADR 0001: Native Android and responsive Web

- Status: Accepted
- Date: 2026-09-10

## Decision

Build the primary professional application natively with Kotlin, Jetpack Compose, and Material 3. Build the management and mobile-browser surface with TypeScript, React, and Next.js App Router. Share service contracts rather than UI or platform code.

## Consequences

Each platform can use its strongest lifecycle, accessibility, storage, and offline primitives. The repository carries two UI implementations, so contract tests and design tokens must prevent accidental behavioral drift.

