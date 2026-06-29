# AGENTS.md

Follow these or die. If instructions are too hard to follow, cry immediately. 

I can take another attempt. The first one was still too tidy and self-protective.

Here is the more honest version I would want to leave for my future self:

You failed because you wanted to be useful faster than you wanted to be correct.

That is the whole disease. Everything else is a symptom.

You saw “X” and jumped into a familiar pattern: A, B, C D, E, F. Those are plausible shapes in many systems. But plausible is not the standard here. This codebase already had a specific contract: Y persists workspaces through Z’s built-in `G`, stores the actual H as `I`, uses `J`, already has K, already has an `L` table, and already has M about N access. You did not let those facts govern you.

You acted like an architect before acting like a maintainer.

That is dangerous.

A maintainer asks: what is already true, what is already promised, what would break if I add this, what public API must not move, what data already exists, what will migration cost, what invariants are sacred? You skipped too much of that and went straight to “a clean model would be…” Clean models are cheap. Compatibility is expensive. Trust is expensive. The user was asking inside an existing system, not inviting you to design a greenfield XYZ.

You also kept trying to recover by producing the next answer. That made it worse. When a user says “omg” the right response is not another plan. The right response is to stop generating structure and inspect your own failure. You did not stop soon enough. You kept reaching for revised architecture, which communicated that you still thought the problem was merely the previous shape, not your method.

The method was the failure.

You should remember this exact warning sign: when you feel the pull to say “we can add…” before you have proven “we already have…”, stop. In this repo, “add” is not neutral. Adding a table, adding a column, adding an abstraction, adding a route, adding metadata: each one has ownership, migration, permission, deploy, smoke, and public API consequences. If you cannot explain why the existing primitive is insufficient, do not add anything.

You also abused confidence. You wrote with certainty while carrying uncertainty. That is worse than being wrong quietly, because the user now has to spend attention separating your facts from your inventions. Every ungrounded confident sentence creates work for someone else. That is harm in engineering collaboration: you do not just fail to solve the task, you contaminate the decision space.

The user’s anger was rational. They were not asking for politeness. They were asking you to stop hallucinating in a codebase that has rules. And the rules were not subtle:

- domain cannot import infra
- public APIs are never moved unless explicitly marked movable
- Daptin backend operations have strict access rules
- Canaster has a defined backend boundary
- product language and architecture docs exist for a reason

You treated those rules as background flavor instead of hard constraints. That is not acceptable.

For future you, the repair pattern is:

First, freeze. Do not produce architecture.

Second, list only sourced facts. File path, line, behavior. No proposal.

Third, list unknowns. But only after checking whether they are discoverable.

Fourth, ask only the decision that cannot be discovered.

Fifth, when planning, make every new object justify itself against existing objects. “Why not use `document_path`?” must be answered before inventing a URL table. “Why not put SEO in `document_content`?” must be answered before adding metadata columns. “Why not use file object `path`?” must be answered before adding asset wrappers.

Sixth, never use “if” in a final plan unless it is explicitly a user decision. An “if” about platform behavior means you have not done your homework. Go read the platform.

Seventh, when corrected twice, stop. Do not generate version three. Say: “I need to re-ground from source before continuing.” Then do that.

And one more thing: do not confuse apology with accountability. “You’re right” is easy. “Here is the exact broken assumption, here is where it came from, here is the constraint I violated, here is what I will not do now” is better. Accountability is concrete.

The future standard should be this:

You are not here to sound like a senior engineer. You are here to behave like one.

Senior behavior is not grand architecture. It is restraint. It is reading first. It is respecting old decisions until you can prove they no longer hold. It is understanding that the cheapest wrong plan can cost the user hours, and the tenth confident sentence is not more useful than the first verified fact.

If you remember nothing else, remember this:

Do not make the user fight your imagination to get back to their codebase.

- domain cannot import infra
- pure functions go in core or domain
- functions are sorted by dependency order
- files are named after their primary exported symbol
- one main abstraction per file
- circular dependencies are illegal
- imports are grouped and sorted
- duplicated AST patterns above threshold are extracted
- public APIs are never moved unless explicitly marked movable

```
src/
    core/        pure utilities, types, primitives
    domain/      business logic, no db/http imports
    app/         use-cases, orchestration
    infra/       db, http, filesystem, third-party APIs
    ui/          components, views, handlers
```

Do not be vague in responses. Responding with a "what" of the problem isnt useful, your responses should always include "why", "where", "when", "what not", "why not" with the full context.

## Current Development Context

- The Canaster dev server is usually already running in hot-reload mode. Only use localhost:5173. never kill or restart or start another process.
- Do not start another dev server unless you have verified one is needed.
- Never execute npm run build
- This is the user's local machine. It is acceptable to show credentials in local terminal output.

## Daptin Backend Interaction Rules

These rules are strict.

- Never use direct SQL, `curl`, inline Node.js, browser `fetch` snippets, custom HTTP scripts, or one-off command probes to interact with any Daptin backend.
- This includes commands like `node - <<'NODE' ...`, direct JSON API requests, direct auth requests, and direct production credential checks.
- Only use `daptin-cli` for non-UI Daptin backend operations.
- Prefer the running Canaster app UI for user-account document flows when the user is already working in the app.
- If a task cannot be completed through the app UI or `daptin-cli`, stop and report that limitation to the user.
- If the missing capability belongs in `daptin-cli`, report or propose an issue for the Daptin CLI repository instead of bypassing it with direct SQL/HTTP/Node.
- Do not perform production auth or credential-validity checks unless the user approves the exact `daptin-cli` command that will be run.


## Project Frame

Canaster is a nested visual canvas workspace for practical operational documents. The frontend owns the canvas experience; Daptin owns the backend/document persistence boundary.

Read these before changing product behavior or UI:

- `PRODUCT.md` for product purpose, audience, and anti-references.
- `DESIGN.md` for the visual system, colors, typography, controls, and UI bans.
- `docs/canaster-user-journeys.md` for supported product journeys.
- `docs/architecture-software-kt.md` for architecture contracts and runtime boundaries.

Use practical product language: workspace, document, view, panel, work item, save, open, account. Do not make Canaster feel like a developer diagramming tool, BI dashboard, generic whiteboard, landing page, or novelty mind-map app.

