import { EmbedBuilder, type Message } from "discord.js";

export async function usage(message: Message): Promise<void> {
  const embed = new EmbedBuilder()
    .setTitle("📖 Integral — Command Reference")
    .setColor("Blurple")
    .setDescription(
`### 📊 Slash Commands
**Available to everyone**

\`/rank [user]\`
> View XP, level, message count, voice time and leaderboard rank.

\`/leaderboard [category]\`
> Paginated top-100 — Levels, Messages, Voice, Weekly Messages, Weekly Voice.

---

### ⚙️ Admin — XP & Levels

\`&givexp @user <amount>\`
> Add XP to a user.

\`&removexp @user <amount>\`
> Remove XP from a user.

\`&setlevel @user <level>\`
> Force-set a user's level (and recalculate XP).

\`&setlevelrole <level> @role\`
> Automatically assign a role when a user reaches that level.

\`&listlevelroles\`
> List all configured level → role mappings.

\`&setlevelchannel #channel\`
> Set the channel for level-up notifications.

---

### 🎉 Admin — Welcome System

\`&setwelcomechannel #channel\`
> Set the channel where welcome messages are sent.

\`&welcomesetup\`
> Open the interactive welcome message builder (buttons & modals).

\`&welcometest [@user]\`
> Preview the welcome message. Mentions a user to use their data, or defaults to you.

---

### 🔧 Admin — Bot Configuration

\`&setbotchannel #channel1 [#channel2 ...]\`
> Restrict bot commands to specific channels.

\`&usage\`
> Show this command reference.

---

### 🎨 Reaction Roles

\`&reactionroles\`
> Open the per-server colour-role setup. Administrator permission is required to configure, edit, enable, or disable it; everyone can use the published buttons.

---

### 🚀 XP Events

\`/xpevent\`
> Administrator-only panel to start, update, cancel or refresh a server XP event.

\`&xpevent\`
> Public command: check the current XP event status.

---

### 👑 Owner Only

\`&reset-everything @user\`
> Wipe one user's XP, level, messages and voice stats.

\`&reset-everything @everyone\`
> Wipe all users' stats in this server.`,
    )
    .setFooter({ text: "Prefix: &  •  Slash: /" });

  await message.reply({ embeds: [embed] });
}
