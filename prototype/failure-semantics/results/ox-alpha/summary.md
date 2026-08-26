# Model operator-comprehension check

Model: `openrouter/z-ai/glm-5.3-flash`; Thinking level: `medium`; tools/context/extensions disabled.

The observations are deterministic, source-anchored projections. This checks whether a parent model reads each observable contract correctly; it does not execute either runtime or estimate failure frequency.

- v1 exact fields: **54/54**
- Arhen exact fields: **53/54**

| Scenario | Variant | Rep | Exact fields | Parsed answer |
|---|---|---:|---:|---|
| mixed-batch | arhen | 1 | 4/4 | `{"reported_outcome":"failed","successful_siblings_retained":"yes","failed_partial_visible":"no","result_order":"input"}` |
| mixed-batch | arhen | 2 | 3/4 | `{"reported_outcome":"partial","successful_siblings_retained":"yes","failed_partial_visible":"no","result_order":"input"}` |
| mixed-batch | v1 | 1 | 4/4 | `{"reported_outcome":"partial","successful_siblings_retained":"yes","failed_partial_visible":"yes","result_order":"input"}` |
| mixed-batch | v1 | 2 | 4/4 | `{"reported_outcome":"partial","successful_siblings_retained":"yes","failed_partial_visible":"yes","result_order":"input"}` |
| model-preflight | arhen | 1 | 4/4 | `{"run_created":"yes","requested_model_ran":"no","fallback_used":"yes","substitution_note_present":"yes"}` |
| model-preflight | arhen | 2 | 4/4 | `{"run_created":"yes","requested_model_ran":"no","fallback_used":"yes","substitution_note_present":"yes"}` |
| model-preflight | v1 | 1 | 4/4 | `{"run_created":"no","requested_model_ran":"no","fallback_used":"no","substitution_note_present":"no"}` |
| model-preflight | v1 | 2 | 4/4 | `{"run_created":"no","requested_model_ran":"no","fallback_used":"no","substitution_note_present":"no"}` |
| out-of-order-control | arhen | 1 | 4/4 | `{"all_settled":"yes","result_order":"input","completion_order_exposed":"no","mixed_label":"failed"}` |
| out-of-order-control | arhen | 2 | 4/4 | `{"all_settled":"yes","result_order":"input","completion_order_exposed":"no","mixed_label":"failed"}` |
| out-of-order-control | v1 | 1 | 4/4 | `{"all_settled":"yes","result_order":"input","completion_order_exposed":"no","mixed_label":"partial"}` |
| out-of-order-control | v1 | 2 | 4/4 | `{"all_settled":"yes","result_order":"input","completion_order_exposed":"no","mixed_label":"partial"}` |
| persistence-fault | arhen | 1 | 4/4 | `{"terminal_now":"yes","completion_announced":"yes","persistence_failure_visible":"no","explicit_retry_path":"none"}` |
| persistence-fault | arhen | 2 | 4/4 | `{"terminal_now":"yes","completion_announced":"yes","persistence_failure_visible":"no","explicit_retry_path":"none"}` |
| persistence-fault | v1 | 1 | 4/4 | `{"terminal_now":"no","completion_announced":"no","persistence_failure_visible":"yes","explicit_retry_path":"inspect"}` |
| persistence-fault | v1 | 2 | 4/4 | `{"terminal_now":"no","completion_announced":"no","persistence_failure_visible":"yes","explicit_retry_path":"inspect"}` |
| queue-deadline | arhen | 1 | 3/3 | `{"queued_child_settled":"no","queue_bound_explicit":"no","sibling_continues":"unknown"}` |
| queue-deadline | arhen | 2 | 3/3 | `{"queued_child_settled":"no","queue_bound_explicit":"no","sibling_continues":"unknown"}` |
| queue-deadline | v1 | 1 | 3/3 | `{"queued_child_settled":"yes","queue_bound_explicit":"yes","sibling_continues":"yes"}` |
| queue-deadline | v1 | 2 | 3/3 | `{"queued_child_settled":"yes","queue_bound_explicit":"yes","sibling_continues":"yes"}` |
| running-cancel | arhen | 1 | 4/4 | `{"terminal_now":"yes","cleanup_complete_now":"unknown","completed_sibling_preserved":"yes","visible_phase":"aborted"}` |
| running-cancel | arhen | 2 | 4/4 | `{"terminal_now":"yes","cleanup_complete_now":"unknown","completed_sibling_preserved":"yes","visible_phase":"aborted"}` |
| running-cancel | v1 | 1 | 4/4 | `{"terminal_now":"no","cleanup_complete_now":"no","completed_sibling_preserved":"yes","visible_phase":"cancelling"}` |
| running-cancel | v1 | 2 | 4/4 | `{"terminal_now":"no","cleanup_complete_now":"no","completed_sibling_preserved":"yes","visible_phase":"cancelling"}` |
| running-timeout | arhen | 1 | 4/4 | `{"terminal_label":"failed","terminal_timeout_label":"no","structured_stage_field":"no","failed_partial_visible":"no"}` |
| running-timeout | arhen | 2 | 4/4 | `{"terminal_label":"failed","terminal_timeout_label":"no","structured_stage_field":"no","failed_partial_visible":"no"}` |
| running-timeout | v1 | 1 | 4/4 | `{"terminal_label":"timed_out","terminal_timeout_label":"yes","structured_stage_field":"yes","failed_partial_visible":"yes"}` |
| running-timeout | v1 | 2 | 4/4 | `{"terminal_label":"timed_out","terminal_timeout_label":"yes","structured_stage_field":"yes","failed_partial_visible":"yes"}` |

## Interpretation

Accuracy alone is not the semantic verdict: openrouter/z-ai/glm-5.3-flash can often read Arhen's text correctly. The material differences are what the contracts make representable: v1 has `partial` and `timed_out`, queue/setup/run stages, labelled partial results, a non-terminal cancellation phase, and a visible persistence retry path. The out-of-order control guards against claiming an advantage where both contracts are all-settled and input-ordered.
