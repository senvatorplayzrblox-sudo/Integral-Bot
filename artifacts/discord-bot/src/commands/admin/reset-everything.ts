import type { Message } from "discord.js";
import { UserStatsModel } from "../../db/models/GuildMember.js";

const OWNER_ID = "1418875905085935637";

export async function resetEverything(
  message: Message,
  args: string[],
): Promise<void> {

  if (message.author.id !== OWNER_ID) {
    await message.reply("❌ You cannot use this command.");
    return;
  }

  const target = message.mentions.users.first();

    if (message.content.includes("@everyone")) {
    await UserStatsModel.updateMany(
      { guildId: message.guildId },
      {
        $set: {
          xp: 0,
          level: 0,
          messages: 0,
          weeklyMessages: 0,
          voiceMinutes: 0,
          weeklyVoiceMinutes: 0,
        },
      },
    );

    await message.reply(
      "✅ Reset completed for everyone."
    );

    return;
  }


  if (!target) {
    await message.reply(
      "❌ Use: `!reset-everything @user` or `!reset-everything @everyone`"
    );
    return;
  }


  await UserStatsModel.updateOne(
    {
      guildId: message.guildId,
      userId: target.id,
    },
    {
      $set: {
        xp: 0,
        level: 0,
        messages: 0,
        weeklyMessages: 0,
        voiceMinutes: 0,
        weeklyVoiceMinutes: 0,
      },
    },
  );


  await message.reply(
    `✅ Reset completed for ${target}.`
  );
}