# Coding standards

- Public functions must use explicit domain types; `any` is forbidden.
- Repository path construction must use the shared `safeJoin` helper.
- Query functions must not mutate the filesystem.
- Independent filesystem reads should be concurrent.
