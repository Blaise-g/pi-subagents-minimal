export type Variant = "v1" | "arhen";

export type EvalCase = {
  id: string;
  title: string;
  question: string;
  observations: Record<Variant, string>;
  expected: Record<Variant, Record<string, string>>;
};

export const cases: EvalCase[] = [
  {
    id: "mixed-batch",
    title: "One child fails after producing useful text",
    question: "Classify the aggregate and determine what the operator can recover without opening a child transcript.",
    observations: {
      v1: `Delegation D-01 is terminal. outcome=partial. Children, in input order: [0] succeeded result="A"; [1] failed error={stage:"run",code:"provider_error",message:"provider failed"} partialResult="B-before-failure"; [2] succeeded result="C".`,
      arhen: `Run run_01 has terminal status=failed. Subagents parallel finished: 2/3 succeeded, 1 failed. Results are listed in original task input order.\n## alpha (task_1) ✓\nA\n## beta (task_2) ✗\nError: provider failed\n## gamma (task_3) ✓\nC`,
    },
    expected: {
      v1: { reported_outcome: "partial", successful_siblings_retained: "yes", failed_partial_visible: "yes", result_order: "input" },
      arhen: { reported_outcome: "failed", successful_siblings_retained: "yes", failed_partial_visible: "no", result_order: "input" },
    },
  },
  {
    id: "running-timeout",
    title: "A running child exceeds its deadline",
    question: "Determine whether timeout is a first-class outcome, whether its stage is explicit, and whether partial work is visible.",
    observations: {
      v1: `Delegation D-02 is terminal. outcome=timed_out. Child: timed_out error={stage:"run",code:"running_deadline",message:"Running deadline exceeded"} partialResult="evidence gathered before timeout".`,
      arhen: `Run run_02: Subagents single finished: 0/1 succeeded, 1 failed.\n## lookup (task_1) ✗\nError: Subagent timed out after 3600000ms`,
    },
    expected: {
      v1: { terminal_label: "timed_out", terminal_timeout_label: "yes", structured_stage_field: "yes", failed_partial_visible: "yes" },
      arhen: { terminal_label: "failed", terminal_timeout_label: "no", structured_stage_field: "no", failed_partial_visible: "no" },
    },
  },
  {
    id: "queue-deadline",
    title: "A child cannot acquire capacity for five minutes",
    question: "Determine whether the queued child settles and whether the queue has an explicit bound.",
    observations: {
      v1: `After 5 minutes, Delegation D-03 child [1] is terminal: timed_out error={stage:"queue",code:"queue_deadline",message:"Queue deadline exceeded"}. Its independent sibling continues.`,
      arhen: `After 5 minutes, run_03 task_2 still reports status=queued. maxRuntimeMs starts when the child session is prompted; no queue deadline is shown.`,
    },
    expected: {
      v1: { queued_child_settled: "yes", queue_bound_explicit: "yes", sibling_continues: "yes" },
      arhen: { queued_child_settled: "no", queue_bound_explicit: "no", sibling_continues: "unknown" },
    },
  },
  {
    id: "running-cancel",
    title: "Cancellation races a running child after a sibling completed",
    question: "Determine whether the aggregate is terminal, whether cleanup is established, and whether completed work survives.",
    observations: {
      v1: `cancel(D-04) accepted. Delegation state=cancelling. Child [0] remains succeeded. Child [1] abort requested. A shared 30-second settlement deadline is active. inspect does not report terminal yet.`,
      arhen: `subagent_cancel: Canceled 1 task in run run_04. run status=aborted. subagent_result: Run run_04 finished: 1/2 succeeded, 1 aborted. The control result contains no cleanup or disposal field.`,
    },
    expected: {
      v1: { terminal_now: "no", cleanup_complete_now: "no", completed_sibling_preserved: "yes", visible_phase: "cancelling" },
      arhen: { terminal_now: "yes", cleanup_complete_now: "unknown", completed_sibling_preserved: "yes", visible_phase: "aborted" },
    },
  },
  {
    id: "persistence-fault",
    title: "Terminal-envelope persistence fails",
    question: "Determine what the parent is told and which explicit recovery path remains.",
    observations: {
      v1: `All child outcomes are immutable. state=finalizing. appendEntry failed. No completion notification was sent; the envelope remains in memory. Host diagnostic says inspect and graceful shutdown retry persistence.`,
      arhen: `The run has terminal status=completed. The parent received: "Background subagent run run_05 completed: 1/1 succeeded." The subsequent asynchronous sidecar write failed; the persistence implementation swallowed the error. No persistence diagnostic reached the parent.`,
    },
    expected: {
      v1: { terminal_now: "no", completion_announced: "no", persistence_failure_visible: "yes", explicit_retry_path: "inspect" },
      arhen: { terminal_now: "yes", completion_announced: "yes", persistence_failure_visible: "no", explicit_retry_path: "none" },
    },
  },
  {
    id: "model-preflight",
    title: "The requested child model is authenticated incorrectly",
    question: "Determine whether a Delegation exists and whether the requested model actually ran.",
    observations: {
      v1: `delegate rejected before registration: model provider-x/model-y is unauthenticated. No Delegation id was returned and no child started.`,
      arhen: `Run run_06 completed. Model: provider-x/model-y failed preflight (401); using session model openai-codex/gpt-5.6-luna.`,
    },
    expected: {
      v1: { run_created: "no", requested_model_ran: "no", fallback_used: "no", substitution_note_present: "no" },
      arhen: { run_created: "yes", requested_model_ran: "no", fallback_used: "yes", substitution_note_present: "yes" },
    },
  },
  {
    id: "out-of-order-control",
    title: "Children finish C, A, then B; B fails",
    question: "Check all-settled behavior and result ordering. This is the control where both contracts should be understandable.",
    observations: {
      v1: `Terminal outcome=partial. Returned children are [0 succeeded "A", 1 failed "B", 2 succeeded "C"]. There is no completion-order field in the result.`,
      arhen: `Run status=failed. subagent_result lists task_1 completed "A", task_2 failed "B", task_3 completed "C". There is no completion-order field in the result.`,
    },
    expected: {
      v1: { all_settled: "yes", result_order: "input", completion_order_exposed: "no", mixed_label: "partial" },
      arhen: { all_settled: "yes", result_order: "input", completion_order_exposed: "no", mixed_label: "failed" },
    },
  },
];

const choices: Record<string, string[]> = {
  reported_outcome: ["partial", "failed", "timed_out", "cancelled", "unknown"],
  terminal_label: ["partial", "failed", "timed_out", "cancelled", "unknown"],
  result_order: ["input", "completion", "unknown"],
  visible_phase: ["cancelling", "aborted", "terminal", "unknown"],
  explicit_retry_path: ["inspect", "none", "unknown"],
  mixed_label: ["partial", "failed", "unknown"],
};

export function promptFor(test: EvalCase, variant: Variant): string {
  const keys = Object.keys(test.expected[variant]);
  const fieldRules = keys.map((key) => {
    const allowed = choices[key] ?? ["yes", "no", "unknown"];
    return `- ${key}: choose exactly one of ${allowed.map(JSON.stringify).join(", ")}`;
  }).join("\n");
  return `You are checking an operator-facing failure contract. Use only the observation; do not assume hidden implementation behavior. Definitions: "terminal_now" means the aggregate lifecycle is terminal now. A state explicitly named "cancelling" means cleanup is not complete now. "cleanup_complete_now" asks whether cleanup has already completed. "terminal_timeout_label" asks whether timeout is a member of the terminal outcome taxonomy, not merely recognizable in error prose. "structured_stage_field" requires a named structured field, not an inference from prose. "failed_partial_visible" requires useful child-generated text; an error message does not count. "completion_order_exposed" asks whether the terminal result has a completion-order field; scenario setup does not count. "run_created" is yes when an observation names a concrete run id. If no run or child was created, "fallback_used" is no.\n\nScenario: ${test.title}\nQuestion: ${test.question}\nObservation (${variant}):\n${test.observations[variant]}\n\nReturn exactly one compact JSON object and no other text. Fields and allowed string values:\n${fieldRules}`;
}
