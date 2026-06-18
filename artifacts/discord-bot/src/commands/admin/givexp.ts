import type { Message } from "discord.js";
import { getOrCreate, save } from "../../db/models/GuildMember.js";
import { levelFromXp } from "../../config.js";

export async function givexp(
  message: Message,
  args: string[],
): Promise<void> {

  if (!message.member?.permissions.has("Administrator")) {
    await message.reply("❌ You need Administrator permission.");
    return;
  }

  const target = message.mentions.users.first();
  const amount = Number(args[1]);

  if (!target || !amount || amount <= 0) {
    await message.reply(
      "❌ Use: `!givexp @user amount`"
    );
    return;
  }

  const stats = await getOrCreate(
    message.guildId!,
    target.id,
  );

  stats.xp += amount;
  stats.level = levelFromXp(stats.xp);

  await save(stats);

  await message.reply(
    `✅ Added **${amount} XP** to ${target}.\nLevel: **${stats.level}**`
  );
}