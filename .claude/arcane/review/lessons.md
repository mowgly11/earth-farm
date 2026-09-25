# Lessons from arcane reviews

Patterns earlier reviews found in this project, appended by /arcane:review. Every review reads this file; edit or prune it freely.
- 2026-09-25: a profile snapshot taken before a wait (button, confirm) is saved afterwards, so gold or storage changed in between is overwritten (commands/scratch.ts:129)
- 2026-09-25: a collector filter compares the user id baked into the button's customId with itself instead of checking the clicker, so anyone can press it (commands/market.ts:41)
- 2026-09-25: one path stores a storage entry as {name, amount} while another path expects the full item config, so timers become NaN (commands/market.ts:108)
- 2026-09-25: an object found in one profile's array is pushed into another profile's array by reference, so both profiles share and corrupt it (database/methods.ts:104)
- 2026-09-25: a two-party action checks only one party for a pending offer, so the other party can open several at once (commands/trade.ts:93)
- 2026-09-25: a command edits a deep clone but saves the untouched hydrated document, so the change lives only in the cache (commands/feed.ts:171)
- 2026-09-25: the same game action exists as a slash command and a dashboard/inline path with different gates and cooldowns, so rules drift between entry points (commands/dashboard/collector.ts:495)
- 2026-09-25: helpers are re-implemented next to an existing util instead of imported, and generated helpers nothing calls stay in the tree (commands/dashboard/collector.ts:51)
