---
bump: minor
---
`parseArgs` now rejects CLI args that map to nothing the verb declares — unknown `--flags` (not in the input schema) and extra positionals (beyond the declared `positionals`; a trailing variadic still absorbs the rest) — instead of silently dropping them. **Behavior break:** invocations that previously passed unrecognized flags or stray positionals now throw, naming the offending token. This closes a class of footgun where a dropped arg silently reverted a verb to its schema defaults.
