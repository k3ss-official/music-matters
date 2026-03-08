---
description: how to commit changes so every stage is rollback-safe
---

# Commit at Every Milestone

Every meaningful unit of work should be committed before moving to the next.
This ensures every stage is independently rollback-safe with `git revert` or `git reset`.

## When to Commit

Commit after **each** of the following:
- Fixing a bug (even a small one)
- Adding a new feature or endpoint
- Refactoring a module or file
- Deleting/cleaning up stale files
- Making config or environment changes

**Never** bundle multiple unrelated changes into one commit.

## Commit Format

```
<type>(<scope>): <short description>

<optional bullet list of specifics>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`
Scope: `backend`, `frontend`, `pipeline`, `api`, `ui`, `config`

Examples:
```
feat(api): add /tracks/{id}/loops/custom endpoint
fix(pipeline): conditionally skip separation stage based on ProcessingOptions
chore(frontend): remove unused SampleCard and TrackList components
```

## Workflow Steps

1. Complete one logical unit of work
// turbo
2. Stage relevant files:
   ```
   git add <specific files or directories>
   ```
// turbo
3. Commit with a descriptive message:
   ```
   git commit -m "type(scope): description"
   ```
4. Push when a feature is complete or before starting something risky:
   ```
   git push origin main
   ```

## Rolling Back

| Goal | Command |
|------|---------|
| Undo last commit, keep changes | `git reset --soft HEAD~1` |
| Undo last commit, discard changes | `git reset --hard HEAD~1` |
| Revert a specific commit safely | `git revert <commit-hash>` |
| See recent commits to target | `git log --oneline -10` |

## Tagging Stable Milestones

For major stable points (e.g. "ingest working", "stem separation done"):
```
git tag -a v0.x.0 -m "description of milestone"
git push origin --tags
```
