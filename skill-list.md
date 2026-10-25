# Skill Library

> **26 skills** — grouped, always loaded on demand via the `skill` tool.

## Core Workflow

| Skill | When to use |
|-------|-------------|
| `using-superpowers` | **First in every conversation** — establishes how to find and use skills. |
| `brainstorming` | **Before any creative work** — new features, components, behavior changes. Explores intent + design first. |
| `writing-plans` | Have a spec but haven't touched code yet — write the plan before implementation. |
| `executing-plans` | Have a written plan — execute it in a separate session with review checkpoints. |
| `subagent-driven-development` | Executing plans with independent tasks in the current session. |
| `dispatching-parallel-agents` | Facing 2+ independent tasks with no shared state or sequencing. |
| `finishing-a-development-branch` | Implementation done, tests pass — merge, PR, or cleanup via structured options. |

## GitNexus

| Skill | When to use |
|-------|-------------|
| `gitnexus-guide` | Questions about GitNexus itself — tools, graph schema, MCP resources. |
| `gitnexus-cli` | Running CLI commands: analyze, index, status, wiki, list repos. |
| `gitnexus-exploring` | "How does X work?", "Show me the auth flow" — architecture + execution flows. |
| `gitnexus-debugging` | "Why is X failing?", "Trace this bug" — root-cause tracing. |
| `gitnexus-impact-analysis` | "Is it safe to change X?", "What will break?" — pre-edit blast radius. |
| `gitnexus-refactoring` | Rename, extract, split, move — multi-file restructures done safely. |
| `gitnexus-pr-review` | Reviewing a PR — what changed, risk, missing test coverage. |
| `gitnexus-pdg-query` | PDG surface (`pdg_query`, CDG/REACHING_DEF) — "what controls X", "where does Y flow". |
| `gitnexus-taint-analysis` | Extending the CFG/taint/PDG subsystem or reasoning about taint findings. |

## Development Flow

| Skill | When to use |
|-------|-------------|
| `test-driven-development` | **Before writing implementation code** — red, green, refactor. |
| `systematic-debugging` | Any bug, test failure, or unexpected behavior — before proposing fixes. |
| `using-git-worktrees` | Starting feature work needing isolation, or before executing plans. |
| `verification-before-completion` | **Before claiming "done"** — run the commands, confirm the output. |

## Code Review

| Skill | When to use |
|-------|-------------|
| `requesting-code-review` | Just completed tasks or major features — verify work meets requirements. |
| `receiving-code-review` | Got review feedback — apply rigor, not blind implementation. |

## Teaching

| Skill | When to use |
|-------|-------------|
| `systems-engineering-mentor` | Mentoring, systems thinking, explaining technical decisions. |
| `theory-sensei` | Deep, rigorous explanations of CS/SE theory. |

## Meta

| Skill | When to use |
|-------|-------------|
| `writing-skills` | Creating, editing, or verifying skills themselves. |
| `customize-opencode` | Editing opencode's own config, agents, skills, plugins, MCP servers. |

---

### Examples in one line

<details>
<summary>sample questions that trigger each category</summary>

- *"Index this repo", "Generate a wiki"* → `gitnexus-cli`
- *"Review PR #42", "Is it safe to merge?"* → `gitnexus-pr-review`
- *"What will break if I rename `validateUser`?"* → `gitnexus-impact-analysis`
- *"How does login work?"* → `gitnexus-exploring`
- *"Build a component that tracks books"* → `brainstorming`
- *"Write unit tests for this feature"* → `test-driven-development`

</details>
