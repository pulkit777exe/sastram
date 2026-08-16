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

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes (298 tests)
- [ ] New tests added for the change
- [ ] Environment variables documented in `.env.sample` (if applicable)

## Module Conventions

<!-- If this change adds or modifies a module in `modules/`, confirm: -->
- [ ] Barrel export (`index.ts`) updated
- [ ] Types exported from `types.ts`
- [ ] Actions use `createServerAction` from `lib/utils/server-action.ts`
- [ ] No deep imports across modules (use `@/modules/<name>` barrel)

## Authorization

<!-- If this change touches thread data or API routes: -->
- [ ] Thread access checks present (`requireThreadAccessOrThrow` / `requireThreadWriteOrThrow` from `modules/threads/access.ts`)
- [ ] Admin-only routes use `requireAdmin()` / `requireModerator()`
- [ ] No `as any` casts added
