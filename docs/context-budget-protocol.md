# Parent-context budget protocol

The committed measurements in `budgets/context-baselines.json` use the contract tuple exactly: Pi `0.84.3`, provider `openai-codex`, model `gpt-5.6-sol`, medium Thinking, a newly-created otherwise-empty project, a fresh `--no-session` process, and prompt `Reply with exactly OK.`.

Create one empty temporary directory and pack the checkout (`TARBALL=$(npm pack --silent)`). From that directory, run the following commands twice, deleting each output file first. `tools/context-recorder.ts` is the committed recorder/activator; use its absolute path and the tarball's unpacked `package/src/index.ts` absolute path as `$RECORDER` and `$EXTENSION`.

```sh
CONTEXT_RECORD=baseline-1.jsonl pi --no-session --mode json -e "$RECORDER" --provider openai-codex --model gpt-5.6-sol --thinking medium -p 'Reply with exactly OK.'
CONTEXT_RECORD=launch-1.jsonl ACTIVE_TOOLS=delegate pi --no-session --mode json -e "$RECORDER" -e "$EXTENSION" --provider openai-codex --model gpt-5.6-sol --thinking medium -p 'Reply with exactly OK.'
CONTEXT_RECORD=control-1.jsonl ACTIVE_TOOLS=delegation_control pi --no-session --mode json -e "$RECORDER" -e "$EXTENSION" --provider openai-codex --model gpt-5.6-sol --thinking medium -p 'Reply with exactly OK.'
CONTEXT_RECORD=both-1.jsonl ACTIVE_TOOLS=delegate,delegation_control pi --no-session --mode json -e "$RECORDER" -e "$EXTENSION" --provider openai-codex --model gpt-5.6-sol --thinking medium -p 'Reply with exactly OK.'
```

For each of these conditions, run two independent fresh processes:

1. **baseline:** recorder extension only;
2. **launch-only:** recorder plus the packed extension, with `delegate` active;
3. **dynamic-control:** recorder plus the packed extension, with only `delegation_control` active from `session_start`;
4. **both-active:** recorder plus the packed extension, with both extension tools active from `session_start`.

The recorder must save compact `JSON.stringify(event.payload.tools)` from `before_provider_request`, `event.systemPrompt` from `before_agent_start`, and the final assistant message's reported input-token usage. Compute tool bytes as UTF-8 bytes, prompt text as the package condition's system-prompt length minus baseline, and Added context cost as package input tokens minus the matching baseline repetition. Do not average repetitions: record and gate each result. Use the same project path and no other configuration or package changes for all eight package runs and both matching baseline runs.

The deterministic CI test reconstructs compact provider-facing tool JSON from registered names, descriptions, and schemas. It separately reports launch-only, control-only, both-active, and prompt-character gates. A value above an absolute ceiling fails. Growth above 10% fails until `baseline` is updated in a reviewed change with its justification; ceilings must never be changed as part of a baseline update. Provider measurements are deliberately recorded and reviewed separately because they require provider credentials and are model-specific.

The launch and control registrations are also checked for absent `promptSnippet` and `promptGuidelines`; the package's `agents/investigation.md` text is child-only and the committed parent prompt addition is empty.
