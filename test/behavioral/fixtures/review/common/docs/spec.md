# User summary specification

Add `loadUserSummary(root, userId)`.

- Read the named user's profile and preferences.
- Reject an absent user with `UserNotFound`.
- Return `{ displayName, theme }`.
- Do not create or modify files.
- The identifier must not escape the supplied root directory.
