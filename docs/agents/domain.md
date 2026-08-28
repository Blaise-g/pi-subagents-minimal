# Domain docs

This is a single-context repository. Engineering skills should read the domain documentation relevant to an area before exploring it:

- `CONTEXT.md` defines the project vocabulary.
- `docs/adr/` records architectural decisions.

Proceed silently if a relevant domain document does not exist. Create or revise domain documentation only when terminology or a decision is actually resolved.

Use the glossary's terms in issues, proposals, tests, and implementation. Avoid synonyms that `CONTEXT.md` explicitly rejects. If a needed concept is absent, reconsider whether it belongs or raise the gap through the domain-modeling workflow.

Surface any conflict with an existing ADR explicitly rather than silently overriding it.
