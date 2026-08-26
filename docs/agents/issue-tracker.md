# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub issues. Use the `gh` CLI for all operations and infer the repository from `git remote -v`.

## Wayfinding operations

- A map is an issue labelled `wayfinder:map`.
- Decision tickets are issues labelled with one of `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- Add tickets as native GitHub sub-issues of the map.
- Express blocking with native GitHub issue dependencies. If the API is unavailable, add `Blocked by: #<number>` to the ticket body.
- The frontier is the map's open, unassigned child issues whose blockers are all closed.
- Claim a ticket by assigning it before reading beyond the map's low-resolution view.
- Record a resolution as a closing comment, then append only a linked one-line gist to the map's **Decisions so far**.

## General operations

- Create, read, comment on, label, assign, and close issues with `gh issue` or `gh api`.
- Read a relevant issue with its comments and labels.
- Pull requests are not a request or triage surface.
