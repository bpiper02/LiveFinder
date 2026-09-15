# Agent Contract for LiveFinder

1. Read relevant implementation and tests before editing.
2. Make the smallest maintainable change that solves the task.
3. Preserve existing behavior unless the task explicitly changes it.
4. Do not add dependencies without a concrete reason.
5. Never weaken tests, validation, or safety checks just to make work pass.

## Bug workflow

Hypothesis → Evidence → Fix → Regression Test.

Every confirmed bug should become a deterministic regression test where practical.

## LiveFinder safety invariants

- Paid Nero paths must never be automatically selected.
- Unknown required reviewer fields must never be guessed or fabricated.
- Unsafe or incomplete submissions must stop for user intervention.
- Verified free paths may be automated.
- AI findings are hypotheses until supported by executable evidence.

## Verification

- Run targeted tests first.
- Then `npm run qa`.
- Then `npm run build`.
- For substantial changes also run `vibe qa --fast` and `vibe qa --no-cache`.
- Do not claim completion until required verification passes.

## Git

- One logical change per branch.
- No secrets.
- No force-pushing main.
- No unrelated cleanup mixed into feature work.
