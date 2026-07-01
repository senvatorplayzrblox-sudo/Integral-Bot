import type { Guild, GuildMember } from "discord.js";
import type { GuildConfig } from "../db/models/GuildConfig.js";
import { logger } from "./logger.js";

/**
 * Grants every configured level-role for all levels between fromLevel+1 and toLevel
 * (inclusive). Handles multi-level jumps correctly by iterating every intermediate level.
 */
export async function applyLevelRoles(
  guild: Guild,
  member: GuildMember,
  fromLevel: number,
  toLevel: number,
  guildConfig: GuildConfig,
): Promise<void> {
  const levelRoles = guildConfig.levelRoles;
  if (!levelRoles || toLevel <= fromLevel) return;

  for (let level = fromLevel + 1; level <= toLevel; level++) {
    const roleId = levelRoles[String(level)];
    if (!roleId) continue;

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      logger.warn({ guildId: guild.id, level, roleId }, "Level role not found in cache — skipping");
      continue;
    }

    await member.roles.add(role).catch((err: unknown) =>
      logger.error({ err, userId: member.id, level, roleId }, "Failed to add level role"),
    );
  }
}
