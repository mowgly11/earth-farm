# Research log

Findings from outside the codebase that drove a decision. Grouped by topic.

## Mongoose document semantics (v8)

Recorded 2026-09-25. All four points below are recalled from training, not looked up:
node_modules is not installed in this checkout, so nothing could be verified against
the installed package. Treat them as unverified until someone checks them against
https://mongoosejs.com/docs/api/document.html or runs the bot.

1. **`save()` only writes modified paths.** A hydrated document (`Model.hydrate(obj)`)
   starts with no modified paths. `save()` sends a `$set` for the paths that were
   assigned or passed to `markModified()` since, not the whole document. This is why
   `markModified("gold")` on a stale snapshot overwrote gold (review finding on
   `commands/scratch.ts`), and why unmarking gold after an atomic update keeps a later
   `save()` from touching it.
2. **`Document.prototype.unmarkModified(path)` exists** and clears the modified state
   of one path. Used in `database/methods.ts` `atomicUpdate`.
3. **`findOneAndUpdate(filter, update, { new: true })` returns the document after the
   update**, and `.lean()` returns it as a plain object. Used to refresh gold/xp/scratch
   after an atomic `$inc`.
4. **A schema path named `id` shadows the default `id` virtual.** `database/schema.ts`
   declares `id: String`, so `doc.id` is the Discord user id, not the ObjectId string.
   `atomicUpdate` relies on this for its filter, matching how `findUser` already queries.

What it changed: gold and scratch rewards are now written with `$inc`/`$set` through
`atomicUpdate` instead of hydrating a snapshot and saving it.
