import type { Message } from "discord.js";
import { getOrCreate, save } from "../../db/models/GuildMember.js";
import { xpForNextLevel } from "../../config.js";

export async function setlevel(
  message: Message,
  args: string[],
): Promise<void> {

  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const target = message.mentions.users.first();
  const level = Number(args[1]);

  if (!target || isNaN(level) || level < 0) {
    await message.reply(
      "❌ Use: `!setlevel @user level`"
    );
    return;
  }

  const stats = await getOrCreate(
    message.guildId!,
    target.id,
  );

  let xp = 0;

  for (let i = 0; i < level; i++) {
    xp += xpForNextLevel(i);
  }

  stats.xp = xp;
  stats.level = level;

  await save(stats);

  await message.reply(
    `✅ Set ${target}'s level to **${level}**.`
  );
}