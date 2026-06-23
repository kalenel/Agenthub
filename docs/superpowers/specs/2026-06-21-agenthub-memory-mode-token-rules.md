# AgentHub Memory Mode + Token Rules

## Goal

Keep coding fast and chat memory complete at the same time.

## Rules

- Coding mode must load the minimum memory needed to solve the current task.
- Chat mode should recover the user's recent intent, preferences, corrections, open loops, and unresolved items as completely as the budget allows.
- Do not inject the same memory twice in different layers.
- Prefer references, summaries, and scoped recalls over full transcript replay.
- Only write durable memory for explicit requests, long-term preferences, project decisions, stable facts, blockers, and final conclusions.
- Keep core memory append-only in practice: when a fact changes, add a new correction or superseding record instead of deleting the old one.
- Use `supersedes_id` for corrections that replace earlier facts.
- Treat token budget as a first-class constraint: if the budget is tight, reduce search results first, then project recall, then core recall.
- Never trade away required facts for shorter prompts.
- When in doubt, preserve correctness over brevity, but still remove redundancy.

## Mode Guidance

- `coding`: session first, project second, core only for hard constraints.
- `chat`: session + project + core, ordered by relevance and budget.
- `recovery`: session summary, unfinished items, then project and core.
- `subagent`: only the task-local minimum context.
- `search`: return only matched items and essential citations.

## Practical Guardrails

- If a memory item is likely useful across sessions, store it in core or project, not session.
- If it is only useful to the current conversation, keep it in session.
- If a memory item can be restated in one sentence, do not store the whole conversation chunk.
- If a memory item already exists and only needs correction, add a superseding record.
- Do not expand a summary into a long prompt when a short pointer would do.
- Chat, report, and recovery modes may load more memory, but they must still prefer the latest checkpoint, key transitions, and unresolved blockers over bulk history.
- Memory distribution must be recipient-aware: new windows, group-chat agents, subagents, UI, and search each get differently shaped outputs.
- First-pass distribution should try to be complete enough for the recipient's role; if an agent asks again, re-fetch related memory and redistribute instead of dumping everything up front.
- `coding`: keep the bundle light, but never omit the current checkpoint, hard constraints, or any blocker that would change the solution.
- `chat`: heavier bundle, optimized for continuity, user-friendliness, and keeping the current line of work intact.
- `recovery`: prioritize the latest checkpoint, blockers, and transition trail before older background facts.
- If a memory item is likely to be reused by a different recipient, store the source record once and let distribution create recipient-specific slices.
- Prefer short pointers plus local evidence over duplicating the same memory across multiple layers.
- When the budget is tight, reduce breadth before reducing the latest checkpoint or the key transition trail.
