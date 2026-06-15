import mongoose, { type Document, type Model, Schema } from "mongoose";

interface BotConfigDocument extends Document {
  key: string;
  value: string;
}

const botConfigSchema = new Schema<BotConfigDocument>({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
});

const BotConfigModel: Model<BotConfigDocument> =
  mongoose.models["BotConfig"] ??
  mongoose.model<BotConfigDocument>("BotConfig", botConfigSchema);

export async function getConfig(key: string): Promise<string | null> {
  const doc = await BotConfigModel.findOne({ key }).lean<{ value: string }>();
  return doc?.value ?? null;
}

export async function setConfig(key: string, value: string): Promise<void> {
  await BotConfigModel.updateOne({ key }, { $set: { value } }, { upsert: true });
}
