import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type Guild,
  type GuildTextBasedChannel,
  type Interaction,
  type Message,
  type ModalSubmitInteraction,
} from "discord.js";
import {
  cancelActiveXpEvent,
  expireXpEvent,
  getActiveXpEvents,
  getXpEvent,
  setXpEventAnnouncement,
  startXpEvent,
  updateActiveXpEvent,
  type XpEvent,
} from "../db/models/XpEvent.js";
import { logger } from "./logger.js";

const MIN_MULTIPLIER = 2;
const MAX_MULTIPLIER = 100;
const MIN_DURATION_HOURS = 1;
const MAX_DURATION_HOURS = 720;
const SESSION_TTL_MS = 30 * 60_000;
const expiryTimers = new Map<string, NodeJS.Timeout>();

type XpEventDraft = { multiplier: number; endsAt: Date };

type AdminSession = {
  id: string;
  guildId: string;
  adminId: string;
  originChannelId: string;
  expiresAt: number;
  draft?: XpEventDraft;
};

const sessions = new Map<string, AdminSession>();

export function calculateBoostedXp(baseXp: number, multiplier: number): number {
  return Math.floor(baseXp * multiplier);
}

function formatTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;
}

function findGuildEmoji(guild: Guild, candidates: string[], fallback: string): string {
  const candidateSet = new Set(candidates.map((name) => name.toLowerCase()));
  const emoji = guild.emojis.cache.find((entry) => candidateSet.has(entry.name?.toLowerCase() ?? ""));
  return emoji?.toString() ?? fallback;
}

export function buildXpEventAnnouncement(
  guild: Guild,
  event: Pick<XpEvent, "multiplier" | "endsAt" | "hostId">,
): string {
  const rocket = findGuildEmoji(guild, ["rocket", "overdrive"], "🚀");
  const celebration = findGuildEmoji(guild, ["party", "celebration", "shine"], "🎉");
  const lightning = findGuildEmoji(guild, ["lightning", "bolt"], "⚡");
  const clock = findGuildEmoji(guild, ["clock", "time"], "⏰");
  const crown = findGuildEmoji(guild, ["crown", "king"], "👑");
  const fire = findGuildEmoji(guild, ["fire", "flame"], "🔥");
  return [
    `${rocket} XP OVERDRIVE IS LIVE! ${rocket}`,
    "",
    `«${celebration} The XP boost has officially landed!`,
    "Your journey to the next level just got a whole lot faster!",
    "",
    `${lightning} Boost: **${event.multiplier}× XP**`,
    `${clock} Ends: ${formatTimestamp(event.endsAt)}`,
    `${crown} Hosted by: <@${event.hostId}>`,
    "",
    `${fire} Jump in and start stacking XP!»`,
  ].join("\n");
}

function buildEndedAnnouncement(event: XpEvent, cancelled: boolean): string {
  const title = cancelled ? "🛑 XP OVERDRIVE WAS CANCELLED" : "💤 XP OVERDRIVE HAS ENDED";
  const reason = cancelled ? "The XP boost has been cancelled." : "The scheduled XP boost has ended.";
  return `${title}\n\n${reason}\n\nBoost: **${event.multiplier}× XP**\nHosted by: <@${event.hostId}>`;
}

async function findAnnouncementChannel(
  client: Client,
  event: XpEvent,
): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(event.announcementChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== event.guildId) return null;
  return channel as GuildTextBasedChannel;
}

async function syncAnnouncement(
  client: Client,
  event: XpEvent,
  state: "live" | "cancelled" | "ended",
): Promise<boolean> {
  const channel = await findAnnouncementChannel(client, event);
  if (!channel) {
    logger.warn({ guildId: event.guildId, channelId: event.announcementChannelId }, "XP event announcement channel is unavailable");
    return false;
  }
  const guild = client.guilds.cache.get(event.guildId);
  if (state === "live" && !guild) {
    logger.warn({ guildId: event.guildId }, "XP event guild is unavailable for announcement");
    return false;
  }
  const content = state === "live"
    ? buildXpEventAnnouncement(guild!, event)
    : buildEndedAnnouncement(event, state === "cancelled");
  const existing = event.announcementMessageId
    ? await channel.messages.fetch(event.announcementMessageId).catch(() => null)
    : null;
  try {
    if (existing) {
      try {
        await existing.edit({ content });
        return true;
      } catch (error) {
        logger.warn({ err: error, guildId: event.guildId }, "XP event announcement edit failed; posting a replacement");
      }
    }
    const replacement = await channel.send({ content });
    await setXpEventAnnouncement(event.guildId, channel.id, replacement.id);
    return true;
  } catch (error) {
    logger.error({ err: error, guildId: event.guildId }, "Failed to update XP event announcement");
    return false;
  }
}

async function expireAndAnnounce(client: Client, guildId: string): Promise<XpEvent | null> {
  const expired = await expireXpEvent(guildId);
  if (!expired) return null;
  const timer = expiryTimers.get(guildId);
  if (timer) clearTimeout(timer);
  expiryTimers.delete(guildId);
  await syncAnnouncement(client, expired, "ended");
  return expired;
}

function scheduleEventExpiry(client: Client, event: XpEvent): void {
  const previous = expiryTimers.get(event.guildId);
  if (previous) clearTimeout(previous);
  const delay = Math.max(0, event.endsAt.getTime() - Date.now());
  const timer = setTimeout(() => {
    void (async () => {
      try {
        const expired = await expireAndAnnounce(client, event.guildId);
        if (!expired) {
          const current = await getXpEvent(event.guildId);
          if (current?.active) scheduleEventExpiry(client, current);
        }
      } catch (error) {
        logger.error({ err: error, guildId: event.guildId }, "XP event expiry failed");
      }
    })();
  }, delay);
  timer.unref?.();
  expiryTimers.set(event.guildId, timer);
}

export async function startXpEventScheduler(client: Client): Promise<void> {
  try {
    for (const event of await getActiveXpEvents()) {
      try {
        if (event.endsAt.getTime() <= Date.now()) {
          await expireAndAnnounce(client, event.guildId);
        } else {
          scheduleEventExpiry(client, event);
        }
      } catch (error) {
        logger.error({ err: error, guildId: event.guildId }, "Failed to restore XP event expiry");
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Failed to restore XP event schedule");
  }
}

async function getLiveEvent(client: Client, guildId: string): Promise<XpEvent | null> {
  const event = await getXpEvent(guildId);
  if (!event?.active) return null;
  if (event.endsAt.getTime() <= Date.now()) {
    await expireAndAnnounce(client, guildId);
    return null;
  }
  return event;
}

export async function getActiveXpMultiplier(client: Client, guildId: string): Promise<number> {
  const event = await getLiveEvent(client, guildId);
  return event?.multiplier ?? 1;
}

function buildStatusEmbed(event: XpEvent | null): EmbedBuilder {
  if (!event) {
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle("💤 NO XP EVENT")
      .setDescription("«There is currently no XP boost running. Stay tuned for the next one! 🚀»");
  }
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle("🚀 XP OVERDRIVE IS LIVE!")
    .setDescription([
      `⚡ **Boost:** ${event.multiplier}× XP`,
      `⏰ **Ends:** ${formatTimestamp(event.endsAt)}`,
      `👑 **Hosted by:** <@${event.hostId}>`,
    ].join("\n"));
}

function buildAdminComponents(session: AdminSession, active: boolean) {
  const id = (action: string) => `xpevent:${session.id}:${action}`;
  const buttons = active
    ? [
        new ButtonBuilder().setCustomId(id("configure")).setLabel("Change / Extend").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(id("cancel")).setLabel("Cancel Event").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(id("refresh")).setLabel("Refresh").setStyle(ButtonStyle.Secondary),
      ]
    : [
        new ButtonBuilder().setCustomId(id("configure")).setLabel("Configure XP Event").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(id("refresh")).setLabel("Refresh").setStyle(ButtonStyle.Secondary),
      ];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons)];
}

function buildStartConfirmation(session: AdminSession): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const draft = session.draft!;
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle("Confirm XP Event")
    .setDescription(`Start a **${draft.multiplier}× XP** event ending ${formatTimestamp(draft.endsAt)}?`);
  const id = (action: string) => `xpevent:${session.id}:${action}`;
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(id("start-confirm")).setLabel("Confirm & Start").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(id("refresh")).setLabel("Back to Panel").setStyle(ButtonStyle.Secondary),
    )],
  };
}

function buildCancelConfirmation(session: AdminSession): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const id = (action: string) => `xpevent:${session.id}:${action}`;
  return {
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle("Cancel XP Event?").setDescription("The active boost will stop immediately and its announcement will be updated.")],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(id("cancel-confirm")).setLabel("Confirm Cancellation").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(id("refresh")).setLabel("Keep Event").setStyle(ButtonStyle.Secondary),
    )],
  };
}

function buildConfigureModal(session: AdminSession, event: XpEvent | null): ModalBuilder {
  const hours = event
    ? Math.max(1, Math.ceil((event.endsAt.getTime() - Date.now()) / 3_600_000))
    : 24;
  return new ModalBuilder()
    .setCustomId(`xpevent:${session.id}:configure-submit`)
    .setTitle(event ? "Change / Extend XP Event" : "Configure XP Event")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("xp_multiplier")
          .setLabel("XP multiplier (2–100)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(event?.multiplier ?? 25)),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("xp_duration")
          .setLabel("Duration in hours from now (1–720)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(hours)),
      ),
    );
}

function getSession(interaction: Interaction, sessionId: string): AdminSession | null {
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  const isAdmin = interaction.memberPermissions?.has(PermissionFlagsBits.Administrator) ?? false;
  if (
    !isAdmin ||
    interaction.user.id !== session.adminId ||
    interaction.guildId !== session.guildId
  ) return null;
  return session;
}

async function updatePanel(
  interaction: ButtonInteraction | ModalSubmitInteraction,
  session: AdminSession,
  message?: string,
): Promise<void> {
  const event = await getLiveEvent(interaction.client, session.guildId);
  const embed = buildStatusEmbed(event);
  if (message) embed.setFooter({ text: message });
  const components = buildAdminComponents(session, Boolean(event));
  if (interaction.isButton()) {
    await interaction.update({ embeds: [embed], components });
  } else {
    await interaction.reply({ embeds: [embed], components, ephemeral: true });
  }
}

async function handleConfigurationSubmit(
  interaction: ModalSubmitInteraction,
  session: AdminSession,
): Promise<void> {
  const multiplierText = interaction.fields.getTextInputValue("xp_multiplier").trim();
  const durationText = interaction.fields.getTextInputValue("xp_duration").trim();
  const multiplier = Number(multiplierText);
  const durationHours = Number(durationText);
  if (
    !/^\d+$/.test(multiplierText) ||
    !Number.isInteger(multiplier) ||
    multiplier < MIN_MULTIPLIER ||
    multiplier > MAX_MULTIPLIER
  ) {
    await interaction.reply({ content: "Multiplier must be a whole number from 2 to 100.", ephemeral: true });
    return;
  }
  if (
    !/^\d+$/.test(durationText) ||
    !Number.isInteger(durationHours) ||
    durationHours < MIN_DURATION_HOURS ||
    durationHours > MAX_DURATION_HOURS
  ) {
    await interaction.reply({ content: "Duration must be a whole number of hours from 1 to 720.", ephemeral: true });
    return;
  }
  const endsAt = new Date(Date.now() + durationHours * 3_600_000);
  const current = await getLiveEvent(interaction.client, session.guildId);
  if (current) {
    const updated = await updateActiveXpEvent(session.guildId, multiplier, endsAt);
    if (!updated) {
      await updatePanel(interaction, session, "The event ended before the update could be saved.");
      return;
    }
    scheduleEventExpiry(interaction.client, updated);
    const announcementUpdated = await syncAnnouncement(interaction.client, updated, "live");
    await updatePanel(
      interaction,
      session,
      announcementUpdated ? "Event updated." : "Event updated, but its announcement could not be reached. Use Refresh to retry.",
    );
    return;
  }
  session.draft = { multiplier, endsAt };
  await interaction.reply({ ...buildStartConfirmation(session), ephemeral: true });
}

async function handleButton(interaction: ButtonInteraction, session: AdminSession, action: string): Promise<void> {
  if (action === "configure") {
    const event = await getLiveEvent(interaction.client, session.guildId);
    await interaction.showModal(buildConfigureModal(session, event));
    return;
  }
  if (action === "refresh") {
    await updatePanel(interaction, session);
    return;
  }
  if (action === "cancel") {
    const event = await getLiveEvent(interaction.client, session.guildId);
    if (!event) {
      await interaction.update({
        embeds: [buildStatusEmbed(null)],
        components: buildAdminComponents(session, false),
      });
      return;
    }
    await interaction.update(buildCancelConfirmation(session));
    return;
  }
  if (action === "cancel-confirm") {
    const cancelled = await cancelActiveXpEvent(session.guildId);
    if (!cancelled) {
      await updatePanel(interaction, session, "There is no active event to cancel.");
      return;
    }
    const timer = expiryTimers.get(session.guildId);
    if (timer) clearTimeout(timer);
    expiryTimers.delete(session.guildId);
    const announcementUpdated = await syncAnnouncement(interaction.client, cancelled, "cancelled");
    await updatePanel(
      interaction,
      session,
      announcementUpdated ? "Event cancelled." : "Event cancelled, but its announcement could not be reached.",
    );
    return;
  }
  if (action === "start-confirm") {
    const draft = session.draft;
    if (!draft) {
      await updatePanel(interaction, session, "The setup confirmation expired. Configure the event again.");
      return;
    }
    const active = await getLiveEvent(interaction.client, session.guildId);
    if (active) {
      session.draft = undefined;
      await updatePanel(interaction, session, "An event is already active in this server.");
      return;
    }
    const guild = interaction.guild;
    const channel = await interaction.client.channels.fetch(session.originChannelId).catch(() => null);
    if (!guild || !channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== session.guildId) {
      await updatePanel(interaction, session, "The original command channel is unavailable, so no event was started.");
      return;
    }
    const announcement = await (channel as GuildTextBasedChannel)
      .send({ content: buildXpEventAnnouncement(guild, { ...draft, hostId: session.adminId }) })
      .catch((error) => {
        logger.error({ err: error, guildId: session.guildId }, "Failed to send XP event announcement");
        return null;
      });
    if (!announcement) {
      await updatePanel(interaction, session, "I couldn't send the announcement. Check my Send Messages permission and try again.");
      return;
    }
    const started = await startXpEvent({
      guildId: session.guildId,
      multiplier: draft.multiplier,
      endsAt: draft.endsAt,
      hostId: session.adminId,
      announcementChannelId: channel.id,
      announcementMessageId: announcement.id,
    });
    if (!started) {
      await announcement.delete().catch(() => {});
      session.draft = undefined;
      await updatePanel(interaction, session, "An event was started by another administrator first.");
      return;
    }
    session.draft = undefined;
    scheduleEventExpiry(interaction.client, started);
    await updatePanel(interaction, session, "XP event started and announced.");
    return;
  }
}

async function handleModal(interaction: ModalSubmitInteraction, session: AdminSession, action: string): Promise<void> {
  if (action === "configure-submit") await handleConfigurationSubmit(interaction, session);
}

export async function handleXpEventInteraction(interaction: Interaction): Promise<boolean> {
  if (!interaction.isButton() && !interaction.isModalSubmit()) return false;
  if (!interaction.customId.startsWith("xpevent:")) return false;
  const [, sessionId, action] = interaction.customId.split(":");
  if (!sessionId || !action) return true;
  const session = getSession(interaction, sessionId);
  if (!session) {
    await interaction.reply({ content: "This XP event panel expired or you don't have permission to use it. Run /xpevent again.", ephemeral: true });
    return true;
  }
  try {
    if (interaction.isButton()) await handleButton(interaction, session, action);
    else await handleModal(interaction, session, action);
  } catch (error) {
    logger.error({ err: error, guildId: session.guildId, action }, "XP event interaction failed");
    const payload = { content: "The XP event action failed. Please refresh the panel and try again.", ephemeral: true };
    if (interaction.replied || interaction.deferred) await interaction.followUp(payload);
    else await interaction.reply(payload);
  }
  return true;
}

export async function openXpEventAdminPanel(interaction: Interaction): Promise<void> {
  if (!interaction.isChatInputCommand() || !interaction.inGuild() || !interaction.guild) return;
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    await interaction.reply({ content: "Administrator permission is required to manage XP events.", ephemeral: true });
    return;
  }
  const session: AdminSession = {
    id: interaction.id,
    guildId: interaction.guildId,
    adminId: interaction.user.id,
    originChannelId: interaction.channelId,
    expiresAt: Date.now() + SESSION_TTL_MS,
  };
  sessions.set(session.id, session);
  const event = await getLiveEvent(interaction.client, session.guildId);
  await interaction.reply({
    embeds: [buildStatusEmbed(event)],
    components: buildAdminComponents(session, Boolean(event)),
    ephemeral: true,
  });
}

export async function sendPublicXpEventStatus(message: Message): Promise<void> {
  if (!message.guild) return;
  const event = await getLiveEvent(message.client, message.guild.id);
  await message.reply({ embeds: [buildStatusEmbed(event)] });
}
