import { EmbedBuilder } from "discord.js";

export function successEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor("Green")
    .setTitle(`✅ ${title}`)
    .setDescription(description);
}

export function errorEmbed(title: string, description: string) {
  return new EmbedBuilder()
    .setColor("Red")
    .setTitle(`❌ ${title}`)
    .setDescription(description);
}