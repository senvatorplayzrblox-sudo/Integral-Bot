import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface ReactionRoleEntry {
  roleId: string;
  displayName: string;
}

export interface ReactionRoleConfig {
  guildId: string;
  enabled: boolean;
  title: string;
  description: string;
  color: number;
  imageUrl: string | null;
  channelId: string | null;
  messageId: string | null;
  roles: ReactionRoleEntry[];
}

type ReactionRoleConfigDocument = ReactionRoleConfig & Document;

const reactionRoleConfigSchema = new Schema<ReactionRoleConfigDocument>({
  guildId: { type: String, required: true, unique: true },
  enabled: { type: Boolean, default: false },
  title: { type: String, default: "Choose your colour" },
  description: {
    type: String,
    default: "Select one colour role below. Choosing another colour replaces your current colour role.",
  },
  color: { type: Number, default: 0x5865f2 },
  imageUrl: { type: String, default: null },
  channelId: { type: String, default: null },
  messageId: { type: String, default: null },
  roles: {
    type: [
      {
        roleId: { type: String, required: true },
        displayName: { type: String, required: true },
      },
    ],
    default: [],
  },
});

const ReactionRoleConfigModel: Model<ReactionRoleConfigDocument> =
  mongoose.models["ReactionRoleConfig"] ??
  mongoose.model<ReactionRoleConfigDocument>("ReactionRoleConfig", reactionRoleConfigSchema);

export async function getReactionRoleConfig(guildId: string): Promise<ReactionRoleConfig> {
  const doc = await ReactionRoleConfigModel.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, returnDocument: "after" },
  );

  return {
    guildId: doc.guildId,
    enabled: doc.enabled ?? false,
    title: doc.title ?? "Choose your colour",
    description: doc.description ?? "Select one colour role below.",
    color: doc.color ?? 0x5865f2,
    imageUrl: doc.imageUrl ?? null,
    channelId: doc.channelId ?? null,
    messageId: doc.messageId ?? null,
    roles: doc.roles ?? [],
  };
}

export async function updateReactionRoleConfig(
  guildId: string,
  data: Partial<ReactionRoleConfig>,
): Promise<void> {
  await ReactionRoleConfigModel.updateOne({ guildId }, { $set: data }, { upsert: true });
}