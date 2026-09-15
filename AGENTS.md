# LiveFinder Engineering Contract

Before modifying code:

1. Read the relevant implementation and tests first.
2. Make the smallest change surface that solves the task.
3. Preserve existing behavior unless the task explicitly changes it.
4. Do not add dependencies without a concrete reason.
5. Do not weaken tests, validation, types, or safety checks to make work pass.

## Bugs

Use:

Hypothesis → Evidence → Fix → Regression Test

Every confirmed bug should become a deterministic regression test where practical.

## Safety-critical invariants

- Paid Nero paths must never be automatically selected.
- Unknown required reviewer fields must never be guessed or fabricated.
- Unsafe or incomplete submissions must stop for user intervention.
- Verified free paths may be automated.
- AI findings are hypotheses until supported by executable evidence.

## Verification

Run targeted checks first, then:

npm run qa
npm run build

For substantial work also run:

vibe qa --fast
vibe qa --no-cache

Do not call work complete until required verification passes.

## Git

- One logical change per branch.
- No secrets.
- Do not force-push main.
- Do not mix unrelated cleanup into feature work.
