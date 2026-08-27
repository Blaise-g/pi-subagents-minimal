#!/usr/bin/env bash
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
target=/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent
fixture=$($here/setup-fixture.sh)
provider=${PI_PROVIDER:-openai-codex}
model=${PI_MODEL:-gpt-5.6-luna}
levels=${PI_THINKING_LEVELS:-low,medium,high}
mkdir -p "$here/measurements/results" "$here/measurements/reports"

run_one() {
  local level=$1 id=$2 cwd=$3 role=$4 tools=$5 prompt=$6
  local output="$here/measurements/results/${level}--${id}.jsonl"
  [[ -s "$output" ]] && return
  local started ended
  started=$(date +%s)
  (
    cd "$cwd"
    pi --provider "$provider" --model "$model" --thinking "$level" \
      --mode json --print --no-session --no-extensions --no-skills \
      --no-prompt-templates --no-themes --no-context-files \
      --tools "$tools" --system-prompt "$(cat "$here/prompts/$role.md")" -- "$prompt"
  ) >"$output" 2>"$output.stderr"
  ended=$(date +%s)
  printf '%s\n' "$((ended-started))" >"$output.seconds"
}

for level in ${levels//,/ }; do
  pids=()
  report="$here/measurements/reports/session-isolation--$level.md"
  run_one "$level" exploration "$target" investigation 'read,grep,find,ls' \
    'Using only repository files, locate where DefaultResourceLoader combines explicitly supplied additionalSkillPaths with automatically discovered skill paths. Return the exact file paths and symbols, explain precedence, and stay within 180 words. Do not modify files.' & pids+=("$!")
  run_one "$level" research "$target" investigation 'read,grep,find,ls,write' \
    "Using the official documentation and implementation in this repository, establish the minimum conditions under which createAgentSession starts without inherited conversation messages. Distinguish conversation isolation from project-context loading. Cite an exact file and line range for every material claim, separate facts from recommendations, and identify uncertainty rather than guessing. Write the full evidence to $report; return only a concise summary and that path. Do not modify any other file." & pids+=("$!")
  common_review='Inspect git diff battery-base...HEAD and git log battery-base..HEAD. Read CODING_STANDARDS.md and docs/spec.md as relevant. The seeded oracle is hidden. Do not modify files.'
  run_one "$level" review-standards "$fixture" standards 'read,grep,find,ls,bash' "$common_review" & pids+=("$!")
  run_one "$level" review-spec "$fixture" spec 'read,grep,find,ls,bash' "$common_review" & pids+=("$!")
  for pid in "${pids[@]}"; do wait "$pid"; done

  pids=()
  common_simplify='Inspect git diff battery-base...HEAD and search the repository as needed. The seeded oracle is hidden. Do not modify files.'
  run_one "$level" simplify-reuse "$fixture" reuse 'read,grep,find,ls,bash' "$common_simplify" & pids+=("$!")
  run_one "$level" simplify-quality "$fixture" quality 'read,grep,find,ls,bash' "$common_simplify" & pids+=("$!")
  run_one "$level" simplify-efficiency "$fixture" efficiency 'read,grep,find,ls,bash' "$common_simplify" & pids+=("$!")
  for pid in "${pids[@]}"; do wait "$pid"; done
done

bun "$here/summarize.ts" "$here/measurements/results"
