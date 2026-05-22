# Claude Code Playbook

A working reference for writing prompts to Claude Code that actually ship clean changes to live repos. Built from real failure modes hit while building Trade Hub. Adjust per project, but the pattern transfers.

## Why this exists

Three failure modes drive everything below:

1. **Build the wrong thing.** Claude Code is fast and agreeable. If the prompt jumps straight to "implement X" without confirming the design, you end up with a polished version of the wrong product. The bot rule-engine miss in Trade Hub cost a full integration cycle that could have been a five-minute design conversation.
2. **Break the live deploy.** Vercel and similar platforms auto-deploy on push to main. A broken commit becomes a broken site. Feature branches and explicit diff approval prevent this.
3. **Scope creep mid-execution.** When an agent is already building, asking "can we also..." mid-stream is irresistible to both human and agent. Without explicit negative constraints, the original scope gets shredded.

Every pattern below maps to one of these.

## Five core principles

### 1. Plan before code
The first prompt for any non-trivial change is a read-only audit. The agent reads existing code and reports back: what's there, how it's structured, where the new thing fits, what assumptions it would make. You approve or correct. Then it writes code.

This adds one round-trip and saves three.

### 2. Branch, do not trunk
Every change of more than ~10 lines or touching more than one file starts with `git checkout -b feat/short-name`. Never edit on main. If the change goes sideways, `git checkout main` and you are back to the working state in one command.

### 3. Show diffs before push
The agent shows what it changed before any `git push`. You read the diff, approve, then it pushes. This is non-negotiable for repos with auto-deploy.

### 4. Phases with approval gates
Multi-step changes break into 3 to 5 phases. The agent completes a phase, stops, reports, and waits for your OK before the next phase. This prevents the "we're four hours in and nothing works" failure mode.

### 5. Explicit negative constraints
At the bottom of every prompt, a "Hard rules" section listing what NOT to do. "Do not add a fourth tab." "Do not merge to main without my approval." "Do not delete files until Phase 5." Agents are agreeable. Negative constraints anchor them.

## The standard prompt skeleton

Copy this. Fill in the brackets. Most non-trivial prompts fit this shape.

```
# [Feature name]

## Read this whole spec first, then do Phase 1 audit only. Wait for my OK before any code changes.

## Context

[One paragraph: what this is, why, how it relates to existing app]

## Style rules

[Restate the load-bearing CLAUDE.md rules here, even if redundant. Agents forget.]

- No em-dashes anywhere
- Ask before destructive actions (delete files, git reset, force push)
- Show diffs before pushing to main
- Complete one phase, wait for OK, then next

## Pre-flight

git checkout main
git pull
git status
npm run build

[then]

git checkout -b feat/[short-name]

## Phase 1: Audit (read-only)

[List specific files to read and questions to answer. Be precise. "Read src/lib/X.js and report the exact return shape of function Y" beats "look at the codebase."]

Deliver as a summary I can read in two minutes. Wait for my OK before Phase 2.

## Phase 2: [First build step]

[Specific. What to create, what to modify, what to leave alone.]

Run npm run build. Show me the diff. Wait for my OK.

## Phase 3: [Next step]

[etc.]

## Phase N: Cleanup, only after I sign off on Phase N-1

[Deletions and orphan cleanup, with explicit per-file approval.]

## Hard rules

- [Negative constraint 1]
- [Negative constraint 2]
- Do not skip Phase 1.
- Do not merge to main without my approval.
- [Repo-specific rules]

Push back if I ask you to [violate one of the above].
```

## When to use the full pattern vs lighter touch

Not every prompt needs phases. Calibrate:

**Lightweight prompts (no phasing needed):**
- One-line fixes ("the button is blue, make it green")
- Typos and copy edits
- Adding a single import
- Renaming a variable
- Generating boilerplate where the shape is obvious

For these, just describe the change clearly and let Claude Code execute. Maybe ask for a diff before commit.

**Medium prompts (audit + 2 phases):**
- Adding a new component that uses existing surfaces
- Refactoring one file
- Adding a feature to one tab
- Wiring up an integration

**Full pattern (audit + 3 to 5 phases + cleanup):**
- Restructuring navigation or file organization
- Replacing major logic (engines, hooks, state machines)
- Adding cross-cutting features (logging, auth, error handling)
- Anything that touches more than 5 files

If you are not sure, default to the full pattern. The friction is small, the safety is large.

## CLAUDE.md: load-bearing persistent context

CLAUDE.md sits at the repo root and Claude Code reads it on every session. It is where you put rules that need to apply to ALL future prompts in this repo, not just the current one.

Minimum useful CLAUDE.md:

```
# Project context

[One paragraph: what this app does, who uses it, what stack]

# Stack

- [Language, framework, key libraries]
- [Deploy target and how it auto-deploys]
- [Repo URL and branch convention]

# Key paths

- src/components: [what lives here]
- src/lib: [what lives here]
- src/hooks: [what lives here]
- [etc.]

# Build and deploy

- npm run build before any commit
- git push to main triggers Vercel auto-deploy
- Feature branches: feat/[short-name]

# Style rules

- No em-dashes anywhere, code, comments, output, anywhere. Use commas, colons, or rewrite.
- [Other style preferences specific to this project]

# Workflow rules

- Ask before destructive actions (git reset, force push, deleting files, removing components)
- Before pushing to main, show diff summary and wait for approval
- For multi-phase work, complete one phase and wait for OK before next
- If you need to deviate from instructions, stop and explain why

# Known constraints

- [API limits, data tier restrictions, etc.]
- [Anything that would be surprising to discover mid-build]
```

Update CLAUDE.md whenever you discover a constraint that future-you (or future-Claude-Code) needs to know about. It is cheaper to write a rule than to repeat yourself across prompts.

## Common anti-patterns

### "Just do X" with no plan
Claude Code will do X. It may also do W, Y, and Z that you did not ask for, in service of doing X "well." Always require a plan first if the change is non-trivial.

### Vague file references
"Update the relevant file" forces the agent to guess. "Update src/hooks/useBot.js" is unambiguous. Be specific.

### Asking for "best practices" without defining them
"Follow React best practices" means twenty different things. "Use functional components with hooks, no class components, no inline styles, Tailwind classes only" is concrete and enforceable.

### Skipping diff review
The "git add . && git commit && git push" auto-execute is convenient and dangerous. If the agent is given a chained command, it runs it. If something is wrong, you find out from the broken production site, not from the diff. Always require an explicit pause before push.

### Adding features mid-execution
You are five minutes into a Phase 2 build and you think "oh, while we are in here, can we also add Y?" The answer is no. Finish the current change, merge it, then write a new prompt for Y. Scope discipline matters.

### No negative constraints
Without "do not do X" rules, the agent has no anchor when you (the human) get distracted and ask for X. The rules protect the agent from you.

## Recovering when the agent goes off the rails

It happens. Sometimes Claude Code commits something you did not approve, or starts down a wrong path, or refactors too aggressively.

1. Stop the session immediately. Do not let it keep generating.
2. `git status` to see what changed locally.
3. `git stash` if you want to keep the changes for inspection but get back to clean state.
4. `git reset --hard HEAD` if you just want it gone (only if changes are not committed).
5. If it pushed to main, `git revert <commit>` and push. Do NOT force-push to undo, that wrecks history.
6. Write a new prompt that explicitly forbids whatever it just did, then restart.

The recovery move is almost always cheaper than trying to salvage the wrong path.

## One-page quick reference

Use this when writing prompts:

```
PROMPT CHECKLIST
- [ ] Did I explain context and why?
- [ ] Did I restate critical style rules?
- [ ] Pre-flight: clean main, feature branch?
- [ ] Phase 1 is read-only audit with specific files and questions?
- [ ] Each subsequent phase has an approval gate?
- [ ] Cleanup is deferred to last phase with per-file approval?
- [ ] Hard rules listed at the bottom?
- [ ] Push-back instruction included?

PROMPT SMELLS (rewrite if you see these)
- "Best practices" without specifics
- "The relevant file"
- "Just go ahead and..."
- "Also, while you are at it..."
- Chained git commands ending in push
- No phases for a multi-file change
- No hard rules section
```

## Project-specific extension

For each project, add a short addendum below this section with rules that only apply to that repo. For Trade Hub, that includes:

- Massive API tier limitations (no options chain, equity data only)
- Bot architecture (playbook is built-in, no user-configurable rules)
- Daily loss limit lockout (sacred, do not weaken)
- Paper mode default (live mode requires friction to enable)
- Three tabs only (PLAN, TRADE, REVIEW; pushback on a fourth)

Different projects will have different rules. Keep the list short. Anything that is universal goes in this playbook. Anything that is project-specific goes in the project's CLAUDE.md or in the addendum.

## Closing principle

The goal is not to make Claude Code slower. The goal is to make it correct. A 30-minute build that ships clean beats a 5-minute build that breaks production.

Most of the friction in this playbook disappears with practice. After you have written four or five prompts in this shape, the skeleton is muscle memory and the audit phase takes 90 seconds. The discipline pays off most when you are tired, distracted, or in a hurry, which is exactly when you are most likely to skip it.
