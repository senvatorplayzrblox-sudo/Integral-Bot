import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface GuildConfig {
  guildId: string;
  botChannelIds: string[];
  levelChannelId: string | null;
  levelRoles: Record<string, string>;
}


type GuildConfigDocument = GuildConfig & Document;

const guildConfigSchema = new Schema<GuildConfigDocument>({
  guildId: { type: String, required: true, unique: true },
  botChannelIds: { type: [String], default: [] },
  levelChannelId: { type: String, default: null },
  levelRoles: {
    type: Object,
    default: {},
  },
});

const GuildConfigModel: Model<GuildConfigDocument> =
  mongoose.models["GuildConfig"] ??
  mongoose.model<GuildConfigDocument>("GuildConfig", guildConfigSchema);


export async function getGuildConfig(guildId: string): Promise<GuildConfig> {

  const doc = await GuildConfigModel.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, returnDocument: "after" },
  );

  return {
    guildId: doc.guildId,
    botChannelIds: doc.botChannelIds ?? [],
    levelChannelId: doc.levelChannelId,
    levelRoles: doc.levelRoles ?? {},
  };
}


export async function updateGuildConfig(
  guildId: string,
  data: Partial<GuildConfig>,
): Promise<void> {

  await GuildConfigModel.updateOne(
    { guildId },
    { $set: data },
    { upsert: true },
  );
}