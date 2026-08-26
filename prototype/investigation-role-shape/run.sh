#!/usr/bin/env bash
set -eo pipefail

here=$(cd "$(dirname "$0")" && pwd)
target=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent
provider=${PI_PROVIDER:-openai-codex}
model=${PI_MODEL:-gpt-5.6-sol}
thinking=${PI_REASONING_LEVEL:-medium}
mkdir -p "$here/results"

run_one() {
  local id=$1 variant=$2 role=$3 prompt=$4
  local output="$here/results/${id}--${variant}.jsonl"
  [[ -s "$output" ]] && return
  (
    cd "$target"
    pi --provider "$provider" --model "$model" --thinking "$thinking" \
      --mode json --print --no-session --no-extensions --no-skills \
      --no-prompt-templates --no-themes --no-context-files \
      --tools read,grep,find,ls \
      --system-prompt "$(cat "$here/prompts/$role.md")" \
      -- "$prompt"
  ) >"$output" 2>"$output.stderr"
}

pids=()
while IFS=$'\t' read -r id kind prompt; do
  run_one "$id" combined combined "$prompt" & pids+=("$!")
  run_one "$id" specialized "$kind" "$prompt" & pids+=("$!")
  if ((${#pids[@]} >= 4)); then
    for pid in "${pids[@]}"; do wait "$pid"; done
    pids=()
  fi
done < <(jq -r '.[] | [.id, .kind, .prompt] | @tsv' "$here/tasks.json")
for pid in "${pids[@]}"; do wait "$pid"; done

printf 'Wrote results to %s/results\n' "$here"
