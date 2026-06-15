# Integral

A Discord statistics bot that tracks XP, levels, message counts, and voice activity across a server.

## Run & Operate

- `pnpm --filter @workspace/discord-bot run dev` — run the bot in watch mode
- `pnpm --filter @workspace/discord-bot run deploy` — register slash commands with Discord
- `pnpm --filter @workspace/discord-bot run typecheck` — typecheck the bot package
- `pnpm run typecheck` — full typecheck across all packages
- Required env: `DISCORD_TOKEN` — bot token from Discord Developer Portal
- Optional env: `DISCORD_CLIENT_ID` — needed for `deploy` script
- Optional env: `DISCORD_GUILD_ID` — set for instant guild-scoped command registration (dev)
- Optional env: `LEVEL_UP_CHANNEL_ID` — channel to send level-up messages; falls back to message channel
- Optional env: `MONGODB_URI` — MongoDB connection string (not wired yet; in-memory store active)

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Discord.js v14
- tsx (TypeScript execution, no separate compile step)
- pino (structured logging)
- MongoDB + Mongoose (planned; currently in-memory placeholder)

## Where things live

- `artifacts/discord-bot/src/index.ts` — bot entry point
- `artifacts/discord-bot/src/client.ts` — IntegralClient (extends Discord.js Client with commands collection)
- `artifacts/discord-bot/src/config.ts` — env config + XP/level math
- `artifacts/discord-bot/src/commands/` — slash command definitions (rank, leaderboard)
- `artifacts/discord-bot/src/events/` — event handlers (ready, messageCreate, interactionCreate)
- `artifacts/discord-bot/src/db/connection.ts` — database connection (placeholder)
- `artifacts/discord-bot/src/db/models/GuildMember.ts` — user stats model (in-memory; swap for Mongoose)

## Architecture decisions

- **In-memory DB placeholder**: All database operations are behind a stable interface in `GuildMember.ts`. Swapping to Mongoose requires only that one file — no other code changes needed.
- **XP formula**: MEE6-compatible — XP needed for level n = `5n² + 50n + 100`. All-time XP accumulates; level is derived, not stored separately except as a cache.
- **XP cooldown**: 60-second per-user cooldown stored in a `Map` in the messageCreate handler. Resets on restart (fine for now; should move to DB later).
- **Leaderboard pagination**: Buttons with a 2-minute collector; only the command invoker can page. Up to 100 users (10 pages × 10).
- **Slash commands**: All commands are slash-only. Register with `pnpm deploy` before first use.

## Product

- `/rank [user]` — shows level, XP progress, leaderboard rank, and weekly message/voice stats
- `/leaderboard [category]` — paginated top-100 for Levels, Messages, Voice, Weekly Messages, Weekly Voice
- Automatic XP gain on messages (15–25 XP, 60s cooldown)
- Level-up notifications sent to a configurable channel

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Run `pnpm --filter @workspace/discord-bot run deploy` after adding or changing slash commands.
- For instant dev command updates, set `DISCORD_GUILD_ID`. Without it, global commands take up to 1 hour.
- `MessageContent` intent must be enabled in the Discord Developer Portal under Privileged Gateway Intents.
- `GuildMembers` intent must also be enabled for member tracking.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
