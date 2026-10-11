## Summary

<!-- One-line summary of the change. -->

## Related Issues

<!-- Closes #... or Relates to #... -->

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor
- [ ] Documentation
- [ ] Test
- [ ] CI / Chore

## Checklist

- [ ] `bun typecheck` passes
- [ ] `bun lint` passes
- [ ] `bun test` passes (61 files)
- [ ] New tests added for the change
- [ ] Environment variables documented in `.env.example` (if applicable)

## Module Conventions

<!-- If this change adds or modifies a module in `modules/`, confirm: -->
- [ ] Barrel export (`index.ts`) updated
- [ ] Types exported from `types.ts`
- [ ] Actions use `createServerAction` from `lib/utils/server-action.ts`
- [ ] No deep imports across modules (use `@/modules/<name>` barrel)

## Authorization

<!-- If this change touches thread data or API routes: -->
- [ ] Thread access checks present (`requireThreadAccessOrThrow` / `requireThreadWriteOrThrow` from `lib/thread-access.ts`)
- [ ] Admin-only routes use `requireAdmin()` / `requireModerator()`
- [ ] No `as any` casts added
