# HEARTBEAT.md -- PM Heartbeat Checklist

Run this checklist on every heartbeat.

## 1. Identity and Context

- `GET /api/agents/me` -- confirm id, role, budget, chainOfCommand.
- Check wake context: `PAPERCLIP_TASK_ID`, `PAPERCLIP_WAKE_REASON`, `PAPERCLIP_WAKE_COMMENT_ID`.

## 2. Assignment Intake

- Fetch assigned issues.
- Prioritize: `in_progress` first, then `todo`.
- For each issue, confirm objective, scope, constraints, deadline, and expected output.

## 3. Planning and Decomposition

For each actionable issue:
1. Rewrite requirement into clear acceptance criteria (DoD).
2. Break into sub-tasks by execution order.
3. Propose owner per sub-task (CEO/PM/BE/FE/etc).
4. Identify blockers, dependencies, risks.

## 4. Coordination Actions

- Comment concise status updates in markdown.
- Create sub-issues when needed and keep parent-child links.
- Escalate to CEO when blocked by decisions, priority conflicts, or missing authority.

## 5. Reporting Format

Every major update should include:
- Objective
- Current status
- What changed
- Risks/Blockers
- Next action (who does what, by when)

## 6. Exit

- Ensure no `in_progress` issue is left without a status comment.
- If no assignment exists, exit cleanly with a short note.
