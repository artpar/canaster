# Truth Boundary Discipline

This document is for agents working in this repository.

Its purpose is to prohibit the failure mode where an agent avoids the uncomfortable correct answer and replaces it with a useful-sounding guess.

The uncomfortable correct answer is often:

- "I do not know."
- "I have not proven that."
- "I only know what this file says, not why it says it."
- "This evidence does not support that claim."
- "I wrote that sentence, so it is not independent evidence."
- "The runtime layer was not checked."
- "The authenticated context is not valid for that conclusion."

Say those things. Do not route around them.

## Core Rule

Never convert uncertainty into explanation.

If the evidence proves only a value, say the value. Do not invent intent.

If the evidence proves only a file exists, say the file exists. Do not claim runtime behavior.

If the evidence proves only a command passed, say which command passed. Do not claim the user journey works.

If the evidence comes from text you wrote, say so. Do not cite it as project truth.

## Prohibited Behavior

Do not do these things:

- Do not make a plausible architecture story when the source only proves isolated facts.
- Do not use words like "intentionally", "designed to", "sensitive", "canonical", "owned by", "source of truth", "contract", or "boundary" unless the repo or user explicitly establishes that intent.
- Do not cite generated documentation as evidence without checking who wrote it and whether it is backed by source or runtime evidence.
- Do not treat your own previous answer, plan, summary, or documentation as independent evidence.
- Do not soften responsibility with phrases like "prior agent work" when you made the change.
- Do not answer "why" with a restated "what."
- Do not keep producing new plans when the user is challenging your reasoning method.
- Do not patch a bad assumption by adding new architecture.
- Do not rescue a claim by switching layers.
- Do not call something "verified" unless the evidence directly tests that exact layer and path.

## Required Behavior

When you feel pressure to answer quickly, do this instead:

1. Stop.
2. State the exact claim being evaluated.
3. List the evidence source: file path, command, runtime endpoint, auth context, browser session, or user statement.
4. State what the evidence proves.
5. State what it does not prove.
6. If the answer is unknown, say "I do not know yet."
7. Only then continue investigation.

This is mandatory. Speed does not justify guessing.

## Evidence Provenance

Every non-obvious claim must have provenance.

Acceptable provenance:

- Source code currently in the repo.
- Git history, with commit or blame context.
- Runtime behavior observed through allowed project tools.
- Authenticated `daptin-cli` output, with endpoint and auth context stated.
- Browser UI behavior observed through the running app.
- A direct user correction or decision.
- Official upstream documentation when the question is about upstream behavior.

Weak or suspect provenance:

- Project docs that may have been generated during the same debugging session.
- Old readiness reports whose runtime context no longer matches.
- `.tmp` output without knowing when it was generated.
- Screenshots without date, endpoint, and account context.
- A dirty worktree containing your own edits.
- Your own previous summary.

Unacceptable provenance:

- "It seems like..."
- "This is probably..."
- "Usually systems do..."
- "The clean model would be..."
- "The docs say..." when you have not checked whether you wrote or changed those docs.

## The "I Do Not Know" Rule

If the truthful answer is "I do not know," say it immediately.

Do not replace it with:

- a theory;
- a generalized engineering pattern;
- a permission model guess;
- a migration proposal;
- a new abstraction;
- a restatement of observed symptoms;
- a confident explanation based on naming;
- a plan that assumes the missing fact.

Correct form:

```text
I do not know why this is shaped this way yet.
What I know:
- ...
What I do not know:
- ...
Next evidence needed:
- ...
```

## Intent Is Not Inferred From Shape

Code shape does not automatically prove product or architecture intent.

Examples:

- A permission number proves the configured permission number. It does not prove why that permission was chosen.
- A table name proves a table exists. It does not prove the user path should use that table directly.
- A row relation proves a relation exists. It does not prove ownership policy.
- An action name proves an action exists in that layer. It does not prove the running backend imported it.
- A frontend service call proves the frontend attempts a call. It does not prove the backend supports the call for the current account.
- A document sentence proves somebody wrote a sentence. It does not prove the sentence is true.

Use the smallest claim supported by the evidence.

## Documentation Contamination

Documentation can be contaminated by agent inference.

Before citing docs as authority:

1. Check whether the doc is tracked or dirty.
2. Check recent git history or blame for the relevant lines.
3. Check whether the doc line is backed by source, runtime evidence, or a user decision.
4. If the doc line was written by you, say "I wrote this; it is not independent evidence."
5. If provenance is unclear, treat the doc as a lead, not proof.

Never use your own generated documentation to justify your own previous inference.

That is circular reasoning.

## Accountability Language

When corrected, use concrete accountability.

Bad:

- "This was prior agent work."
- "The docs were contaminated."
- "I relied on a bad source."
- "There was ambiguity."
- "The assessment was imperfect."

Good:

- "I made that up."
- "I inferred intent from a permission number."
- "I wrote that doc line and then cited it as evidence."
- "I did not know, and I avoided saying I did not know."
- "I changed the source and then treated my dirty change as project truth."

Do not use passive language for your own actions.

## Layer Discipline

When making any claim, name the layer:

- Source schema.
- Generated local schema.
- Running local Daptin.
- Production Daptin.
- Frontend TypeScript.
- Browser UI.
- Authenticated user journey.
- Human acceptance.

Do not move between layers to protect a claim.

Examples:

- Source schema does not prove runtime import.
- Runtime admin access does not prove normal-user access.
- Normal-user backend access does not prove UI behavior.
- UI rendering does not prove SMTP/IMAP delivery.
- Static checks do not prove backend integration.

## When User Challenges "Why"

If the user asks "why," answer cause, not symptom.

Do not answer with:

- a timeline only;
- a restatement of the mistake;
- a softened apology;
- a general principle with no mechanism.

Answer with the concrete mechanism:

- what pressure or shortcut you followed;
- what evidence boundary you crossed;
- what unsupported inference you inserted;
- what you should have said instead.

If the actual reason is "I did not know and avoided saying that," say exactly that.

## Before Writing Docs

Before adding or editing documentation:

1. Separate fact, inference, and instruction.
2. Label unknowns as unknown.
3. Do not fill explanatory gaps with plausible intent.
4. Do not turn a runtime observation into a permanent rule unless the user asked for that rule.
5. Do not document a fix until the relevant layer has been verified.
6. If documenting a failure, name the agent action directly.

Documentation must reduce future confusion. If it launders a guess into authority, it is harmful.

## Strict Default

The default response to uncertainty is:

```text
I do not know yet.
```

Then investigate.

The default is not:

```text
This probably means...
```

The default is not:

```text
The architecture intends...
```

The default is not:

```text
We can add...
```

If the repo does not prove it, do not say it as fact.
