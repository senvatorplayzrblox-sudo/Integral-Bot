import mongoose, { Schema, type Document, type Model } from "mongoose";

export interface XpEvent {
  guildId: string;
  active: boolean;
  multiplier: number;
  endsAt: Date;
  hostId: string;
  startedAt: Date;
  announcementChannelId: string;
  announcementMessageId: string;
}

type XpEventDocument = XpEvent & Document;

const xpEventSchema = new Schema<XpEventDocument>(
  {
    guildId: { type: String, required: true, unique: true },
    active: { type: Boolean, default: false },
    multiplier: { type: Number, default: 1, min: 1, max: 100 },
    endsAt: { type: Date, default: () => new Date(0) },
    hostId: { type: String, default: "" },
    startedAt: { type: Date, default: () => new Date(0) },
    announcementChannelId: { type: String, default: "" },
    announcementMessageId: { type: String, default: "" },
  },
  { timestamps: true },
);

const XpEventModel: Model<XpEventDocument> =
  mongoose.models["XpEvent"] ?? mongoose.model<XpEventDocument>("XpEvent", xpEventSchema);

function toPlain(doc: XpEventDocument | null): XpEvent | null {
  if (!doc) return null;
  return {
    guildId: doc.guildId,
    active: doc.active,
    multiplier: doc.multiplier,
    endsAt: doc.endsAt,
    hostId: doc.hostId,
    startedAt: doc.startedAt,
    announcementChannelId: doc.announcementChannelId,
    announcementMessageId: doc.announcementMessageId,
  };
}

type XpEventModelPort = Pick<
  Model<XpEventDocument>,
  "find" | "findOne" | "findOneAndUpdate" | "updateOne"
>;

export function createXpEventRepository(model: XpEventModelPort) {
  async function getXpEvent(guildId: string): Promise<XpEvent | null> {
    return toPlain(await model.findOne({ guildId }));
  }

  async function getActiveXpEvents(): Promise<XpEvent[]> {
    const docs = await model.find({ active: true });
    return docs.map((doc) => toPlain(doc)!).filter(Boolean);
  }

  async function startXpEvent(
    event: Omit<XpEvent, "active" | "startedAt">,
  ): Promise<XpEvent | null> {
    try {
      await model.updateOne(
        { guildId: event.guildId },
        { $setOnInsert: { guildId: event.guildId, active: false } },
        { upsert: true },
      );
    } catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
    }

    const now = new Date();
    return toPlain(await model.findOneAndUpdate(
      {
        guildId: event.guildId,
        $or: [{ active: { $ne: true } }, { endsAt: { $lte: now } }],
      },
      { $set: { ...event, active: true, startedAt: now } },
      { returnDocument: "after" },
    ));
  }

  async function updateActiveXpEvent(
    guildId: string,
    multiplier: number,
    endsAt: Date,
  ): Promise<XpEvent | null> {
    return toPlain(await model.findOneAndUpdate(
      { guildId, active: true, endsAt: { $gt: new Date() } },
      { $set: { multiplier, endsAt } },
      { returnDocument: "after" },
    ));
  }

  async function cancelActiveXpEvent(guildId: string): Promise<XpEvent | null> {
    return toPlain(await model.findOneAndUpdate(
      { guildId, active: true, endsAt: { $gt: new Date() } },
      { $set: { active: false } },
      { returnDocument: "before" },
    ));
  }

  async function expireXpEvent(guildId: string, now = new Date()): Promise<XpEvent | null> {
    return toPlain(await model.findOneAndUpdate(
      { guildId, active: true, endsAt: { $lte: now } },
      { $set: { active: false } },
      { returnDocument: "before" },
    ));
  }

  async function setXpEventAnnouncement(
    guildId: string,
    channelId: string,
    messageId: string,
  ): Promise<void> {
    await model.updateOne(
      { guildId },
      { $set: { announcementChannelId: channelId, announcementMessageId: messageId } },
    );
  }

  return {
    cancelActiveXpEvent,
    expireXpEvent,
    getActiveXpEvents,
    getXpEvent,
    setXpEventAnnouncement,
    startXpEvent,
    updateActiveXpEvent,
  };
}

const repository = createXpEventRepository(XpEventModel);

export const getXpEvent = repository.getXpEvent;
export const getActiveXpEvents = repository.getActiveXpEvents;
export const startXpEvent = repository.startXpEvent;
export const updateActiveXpEvent = repository.updateActiveXpEvent;
export const cancelActiveXpEvent = repository.cancelActiveXpEvent;
export const expireXpEvent = repository.expireXpEvent;
export const setXpEventAnnouncement = repository.setXpEventAnnouncement;
