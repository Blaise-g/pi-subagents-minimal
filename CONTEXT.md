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
Durable role instructions for one Subagent role, stored in an explicitly selected agent Markdown file.
_Avoid_: Agent profile, built-in role

**Investigation**:
A bounded, isolated Subagent task that gathers evidence and returns only the answer the Orchestrator needs; it may optionally create one declared report through a restricted capability.
_Avoid_: Research role, Exploration role, workflow

**Thinking level**:
The Pi setting controlling how much model reasoning a Subagent uses; for GPT models this maps to reasoning effort.
_Avoid_: Effort

**Added context cost**:
The measured increase in fresh-session input tokens caused by loading a subagent package against an otherwise identical session.
_Avoid_: Token footprint, Context budget

**Context budget**:
The enforced upper bound against which Added context cost is judged after the baseline measurements establish an evidence-based value.
_Avoid_: Token target, measured cost

**Concurrency slot**:
One extension-wide permission for a Subagent to run; queued Subagents do not occupy a slot.
_Avoid_: Worker slot, thread

**Queue deadline**:
The maximum time a Subagent may wait for a Concurrency slot before terminating as timed out.
_Avoid_: Stall timeout

**Child run-start boundary**:
The first invocation-bound evidence that a Subagent's agent run has begun; it ends Setup and starts the Running deadline.
_Avoid_: Prompt acceptance

**Running deadline**:
The maximum time from the Child run-start boundary until that Subagent settles.
_Avoid_: Stall watchdog, silence timeout

**All-settled batch**:
A Flat batch in which each independent Subagent is allowed to reach its own terminal outcome, regardless of sibling failures.
_Avoid_: Fail-fast batch

**Settlement evidence**:
The observed run completion, timeout, or cancellation claim from which a Subagent's first and only Terminal outcome is selected.
_Avoid_: Terminal result, provisional outcome

**Terminal outcome**:
The immutable classification of a settled Subagent or Delegation: succeeded, partial, failed, timed out, or cancelled as applicable.
_Avoid_: Status, exit status

**Partial result**:
Bounded Subagent output retained as diagnostic evidence from a failed or timed-out run; it is never treated as a successful result.
_Avoid_: Result

**Recorded evaluation**:
A deliberate, one-off assessment of observable model behavior whose inputs, outputs, evaluation criteria, result, model and provider versions, and source commit are retained for review. It is supporting evidence, not a mechanical CI or release gate.
_Avoid_: Behavioral battery, benchmark, test suite

**Quality smoke**:
A small provider-backed check used when directional confidence in observable model behavior is useful; it does not certify a release.
_Avoid_: Release gate, conformance test

**Significant behavioral change**:
A change intended or reasonably expected to alter observable model behavior, including Agent instructions, public prompts, model or Thinking selection, capability isolation, result projection or aggregation, participating skills, or evaluation fixtures. The change author records whether this boundary is crossed.
_Avoid_: Any large diff, routine refactor

**Lifecycle conformance case**:
One deterministic scenario that drives a public Delegation transition or fault and checks the resulting lifecycle state, envelope, or control behavior without relying on model quality.
_Avoid_: Workflow trial, smoke test

**Task specification**:
One bounded Subagent request within a Delegation, naming the Investigation role, objective, optional model and Thinking level, and optional declared report path.
_Avoid_: Job, child config, agent invocation

**Declared report path**:
The single project-relative Markdown destination a Task specification authorizes an Investigation to create or replace beneath the approved report root.
_Avoid_: Output path, artifact directory

**Terminal envelope**:
The canonical, bounded, immutable record of one settled Delegation and its input-ordered child outcomes.
_Avoid_: Result blob, transcript, run summary

**Host diagnostic**:
A bounded observation about extension configuration, compatibility, persistence, cleanup, or lifecycle that does not alter a Subagent or Delegation outcome.
_Avoid_: Child error, warning log
