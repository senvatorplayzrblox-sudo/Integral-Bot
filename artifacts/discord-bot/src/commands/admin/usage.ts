import { EmbedBuilder, type Message } from "discord.js";

export async function usage(message: Message): Promise<void> {

  const embed = new EmbedBuilder()
    .setTitle("📖 Bot Command Usage")
    .setDescription(
`### 📊 Public Commands
**Everyone can use**

\`/rank\`
> Shows your XP, level, messages, voice and rank.

\`/leaderboard\`
> Shows server leaderboard.


---

### ⚙️ Admin Commands
**Server Administrators only**

\`!setlevelrole level @role\`
> Give a role automatically when a user reaches that level.
\`!listlevelroles\`
> Shows all configured level roles.

\`!givexp @user amount\`
> Add XP to a user.

\`!removexp @user amount\`
> Remove XP from a user.

\`!setlevel @user level\`
> Set user's level.

\`!setbotchannel #channel1 #channel2\`
> Allow bot commands in one or more channels.

\`!setlevelchannel #channel\`
> Set level-up message channel.


---

### 👑 Owner Only

**Owner: Senvator**

\`!reset-everything @user\`
> Reset one user's stats.

\`!reset-everything @everyone\`
> Reset all users' stats.


---

### ℹ️ Utility

\`!usage\`
> Shows this command list.`
    )
    .setColor("Blurple")
    .setFooter({
      text: "Use commands responsibly ✨",
    });

  await message.reply({
    embeds: [embed],
  });
}