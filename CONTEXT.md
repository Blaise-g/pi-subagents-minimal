# Minimal Subagents

A deliberately narrow delegation surface that keeps focused work outside a Pi orchestrator's context and returns only the result needed to continue.

## Language

**Orchestrator**:
The parent Pi session that delegates bounded work and consumes child results.
_Avoid_: Leader, parent agent, coordinator

**Subagent**:
An isolated child Pi session given one bounded task, its own context, and an explicit capability set.
_Avoid_: Worker, delegate, child process

**Delegation**:
One request from the Orchestrator to run either one Subagent or a Flat batch.
_Avoid_: Workflow, mission, job

**Flat batch**:
Multiple independent Subagents started by one Delegation, with no ordering or data dependencies among them.
_Avoid_: Graph, chain, workflow

**Agent definition**:
Durable role instructions that may live in a skill, a child system prompt, or an agent Markdown file; v1 has not yet decided which locations research and exploration use.
_Avoid_: Agent profile, built-in role

**Added context cost**:
The measured increase in fresh-session input tokens caused by loading a subagent package against an otherwise identical session.
_Avoid_: Token footprint, Context budget

**Context budget**:
The enforced upper bound against which Added context cost is judged after the baseline measurements establish an evidence-based value.
_Avoid_: Token target, measured cost
