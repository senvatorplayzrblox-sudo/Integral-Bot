import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface GuildConfig {
  guildId: string;
  botChannelIds: string[];
  levelChannelId: string | null;
  levelRoles: Record<string, string>;
  welcomeEnabled: boolean;
  welcomeChannelId: string | null;
  welcomeAboveText: string | null;
  welcomeTitle: string | null;
  welcomeDescription: string | null;
  welcomeFooter: string | null;
  welcomeBanner: string | null;
  welcomeColor: number;
}

type GuildConfigDocument = GuildConfig & Document;

const guildConfigSchema = new Schema<GuildConfigDocument>({
  guildId:            { type: String, required: true, unique: true },
  botChannelIds:      { type: [String], default: [] },
  levelChannelId:     { type: String, default: null },
  levelRoles:         { type: Object, default: {} },
  welcomeEnabled:     { type: Boolean, default: false },
  welcomeChannelId:   { type: String, default: null },
  welcomeAboveText:   { type: String, default: null },
  welcomeTitle:       { type: String, default: null },
  welcomeDescription: { type: String, default: null },
  welcomeFooter:      { type: String, default: null },
  welcomeBanner:      { type: String, default: null },
  welcomeColor:       { type: Number, default: 0x5865f2 },
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
    guildId:            doc.guildId,
    botChannelIds:      doc.botChannelIds ?? [],
    levelChannelId:     doc.levelChannelId ?? null,
    levelRoles:         doc.levelRoles ?? {},
    welcomeEnabled:     doc.welcomeEnabled ?? false,
    welcomeChannelId:   doc.welcomeChannelId ?? null,
    welcomeAboveText:   doc.welcomeAboveText ?? null,
    welcomeTitle:       doc.welcomeTitle ?? null,
    welcomeDescription: doc.welcomeDescription ?? null,
    welcomeFooter:      doc.welcomeFooter ?? null,
    welcomeBanner:      doc.welcomeBanner ?? null,
    welcomeColor:       doc.welcomeColor ?? 0x5865f2,
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
