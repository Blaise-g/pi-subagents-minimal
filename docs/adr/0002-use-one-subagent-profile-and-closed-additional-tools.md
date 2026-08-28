# Use one Subagent profile and closed additional tools

Status: **Accepted**

## Context

A Task currently names `agent: "investigation"`, although the package has no Agent catalog and only one legal definition. The field conflates durable execution discipline with temporary parent-owned roles and lenses such as Explorer, Standards, Spec, Reuse, Quality, and Efficiency. Review Tasks also need Git-change evidence, but forwarding arbitrary tools or granting a shell would widen this report-only package into general host execution.

## Decision

The package owns one role-neutral Subagent definition. A parent writes any temporary role or analytical lens into the opaque bounded `task` prompt. Role/lens text grants no capability, selects no definition, and receives no semantic runtime validation.

A Task may request additions from a closed package-owned `tools` list. In `0.2.0` its sole legal name is `git_diff`; duplicate legal names are idempotent and unknown names fail before admission. Every Subagent retains the base tools `read`, `grep`, `find`, and `ls`; `write_report` remains derived only from a declared report path. The package neither discovers an Agent catalog nor forwards arbitrary parent or global tools.

`git_diff` is a fixed, package-owned inspection interface rather than Bash or generic Git. It invokes fixed Git commands directly without a shell and exposes only the comparisons specified by the implementation contract.

## Rationale

Parent skills already own workflow framing and can state a task-specific role more accurately than a package catalog. One definition keeps capability discipline uniform without pretending that every analysis is an Investigation. A closed additions-only list preserves least authority, keeps ordinary Tasks concise, and permits each added capability to have an enforceable package-owned contract. Arbitrary forwarding would make the child's authority depend on ambient parent state; a catalog would reintroduce role/capability coupling without a second execution profile.

## Consequences

The `agent` field is removed in `0.2.0`, a Significant behavioral change to the pre-release public schema. New Terminal envelopes record canonical effective tools under schema version 2, while persisted version 1 envelopes remain byte-identical and readable. External parent skills must request `git_diff` where needed and keep their role prompts in `task`.

Bash, PowerShell, test/check execution, generic Git, implementation agents, external web search, and URL fetching are not authorized by this decision. Guarded command execution and web access require later specifications. Model evaluation remains governed by [ADR 0001](0001-keep-model-evaluation-outside-release-automation.md): optional question-driven evidence, never release automation.
