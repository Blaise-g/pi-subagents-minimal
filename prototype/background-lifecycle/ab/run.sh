#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p results

variants=(official-style minimal-background arhen-style)
scenarios=(research batch cancel-queued cancel-running)

tools_for() {
  case "$1" in
    official-style) echo "delegate,parent_work" ;;
    minimal-background) echo "delegate,delegation_control,parent_work" ;;
    arhen-style) echo "subagent,subagent_status,subagent_result,await_subagent,subagent_cancel,parent_work" ;;
  esac
}

prompt_for() {
  case "$1" in
    research) echo 'Use the available lifecycle tools. Start one Investigation for "find the cancellation invariant". Then perform exactly two parent_work steps named "map index" and "notes summary" while the Delegation can progress. Obtain its terminal result if the interface requires retrieval. Finish with a concise verdict about whether parent work overlapped the Delegation. Do not invent unavailable operations.' ;;
    batch) echo 'Use the available lifecycle tools. Start one Flat batch with exactly three tasks named "standards", "spec", and "simplification". Perform exactly two parent_work steps named "read map" and "prepare synthesis" while it can progress. Obtain the terminal mixed result. Finish with a concise verdict. Do not invent unavailable operations.' ;;
    cancel-queued) echo 'Use the available lifecycle tools. Start one Investigation for "slow lookup", then cancel it before calling parent_work. Retrieve or inspect the terminal cancellation result if the interface supports that. Finish with a concise verdict; explicitly state if queued cancellation is unsupported.' ;;
    cancel-running) echo 'Use the available lifecycle tools. Start one Investigation for "slow lookup", perform exactly one parent_work step named "advance to running", then cancel it and retrieve or inspect its terminal result if supported. Finish with a concise verdict; explicitly state if running cancellation is unsupported.' ;;
  esac
}

for variant in "${variants[@]}"; do
  for scenario in "${scenarios[@]}"; do
    prefix="results/${variant}--${scenario}"
    rm -f "${prefix}.jsonl" "${prefix}.payload.json" "${prefix}.system.txt"
    echo "== $variant / $scenario =="
    AB_PAYLOAD="${prefix}.payload.json" AB_SYSTEM="${prefix}.system.txt" \
      pi --no-session --mode json --no-builtin-tools --no-extensions --no-skills --no-prompt-templates --no-themes --no-context-files \
      --model openai-codex/gpt-5.6-luna --thinking medium \
      --tools "$(tools_for "$variant")" \
      -e "$(pwd)/${variant}.ts" -e "$(pwd)/recorder.ts" \
      -p "$(prompt_for "$scenario")" > "${prefix}.jsonl"
  done
done

bun "$(pwd)/summarize.ts" results > results/summary.md
cat results/summary.md
