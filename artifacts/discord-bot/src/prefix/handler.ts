import { listlevelroles } from "../commands/admin/listlevelroles.js";
import { setlevelrole } from "../commands/admin/setlevelrole.js";
import { getGuildConfig } from "../utils/getGuildConfig.js";
import { usage } from "../commands/admin/usage.js";
import { resetEverything } from "../commands/admin/reset-everything.js";
import { setlevel } from "../commands/admin/setlevel.js";
import { removexp } from "../commands/admin/removexp.js";
import { givexp } from "../commands/admin/givexp.js";
import { setbotchannel } from "../commands/admin/setbotchannel.js";
import { setlevelchannel } from "../commands/admin/setlevelchannel.js";
import type { Message } from "discord.js";

export default async function prefixHandler(message: Message): Promise<boolean> {
  if (message.author.bot || !message.inGuild()) return false;

  if (!message.content.startsWith("&")) return false;

  const args = message.content.slice(1).trim().split(/\s+/);
  const command = args.shift()?.toLowerCase();

  if (!command) return true;
    const guildConfig = await getGuildConfig(message.guildId);

if (
  guildConfig.botChannelIds.length > 0 &&
  !guildConfig.botChannelIds.includes(message.channel.id)
) {
  await message.reply(
    `❌ Bot commands can only be used in <#${guildConfig.botChannelIds.join("> or <#")}>`
  );
  return true;
}

  switch (command) {
  case "test":
    await message.reply("Prefix system working ✅");
    break;

  case "setlevelchannel":
    await setlevelchannel(message, args);
    break;
      case "setbotchannel":
  await setbotchannel(message, args);
  break;
      case "givexp":
  await givexp(message, args);
  break;
      case "removexp":
  await removexp(message, args);
  break;
      case "setlevel":
  await setlevel(message, args);
  break;
      case "reset-everything":
  await resetEverything(message, args);
  break;
          case "usage":
  await usage(message);
  break;
      case "setlevelrole":
  await setlevelrole(message, args);
  break;
      case "listlevelroles":
  await listlevelroles(message);
  break;
      

  default:
    break;
  }

  return true;
}
