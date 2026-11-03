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
  MAX_XP_EVENT_MULTIPLIER,
  MIN_XP_EVENT_MULTIPLIER,
  setXpEventAnnouncement,
  startXpEvent,
  updateActiveXpEvent,
  type XpEvent,
} from "../db/models/XpEvent.js";
import { logger } from "./logger.js";
import { createXpEventRuntime } from "./xpEventRuntime.js";

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const SESSION_TTL_MS = 30 * 60_000;

type XpEventDraft = { multiplier: number; durationMs: number };

type AdminSession = {
  id: string;
  guildId: string;
  adminId: string;
  originChannelId: string;
  expiresAt: number;
  draft?: XpEventDraft;
};

const sessions = new Map<string, AdminSession>();
const runtimes = new WeakMap<Client, ReturnType<typeof createXpEventRuntime>>();

function getXpEventRuntime(client: Client): ReturnType<typeof createXpEventRuntime> {
  let runtime = runtimes.get(client);
  if (!runtime) {
    runtime = createXpEventRuntime({
      store: {
        getXpEvent,
        getActiveXpEvents,
        updateActiveXpEvent,
        cancelActiveXpEvent,
        expireXpEvent,
      },
      syncAnnouncement: (event, state) => syncAnnouncement(client, event, state),
      onError: (error, guildId, action) => {
        logger.error({ err: error, guildId, action }, "XP event lifecycle action failed");
      },
    });
    runtimes.set(client, runtime);
  }
  return runtime;
}

export function calculateBoostedXp(baseXp: number, multiplier: number): number {
  if (!Number.isSafeInteger(multiplier) || multiplier < MIN_XP_EVENT_MULTIPLIER || multiplier > MAX_XP_EVENT_MULTIPLIER) {
    throw new RangeError(`XP multiplier must be a whole number from ${MIN_XP_EVENT_MULTIPLIER} to ${MAX_XP_EVENT_MULTIPLIER}.`);
  }
  return Math.floor(baseXp * multiplier);
}

function formatExactTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:F>`;
}

function formatRelativeTimestamp(date: Date): string {
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

export function formatXpEventDuration(durationMs: number): string {
  const totalMinutes = Number.isFinite(durationMs)
    ? Math.max(0, Math.round(durationMs / MINUTE_MS))
    : 0;
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  return `${days} Days | ${hours} Hours | ${minutes} Minutes`;
}

export function parseXpEventDuration(
  daysText: string,
  hoursText: string,
  minutesText: string,
): number | null {
  const values = [daysText, hoursText, minutesText].map((value) => value.trim());
  if (values.some((value) => !/^\d+$/.test(value))) return null;
  const [days, hours, minutes] = values.map(Number);
  if (
    !Number.isSafeInteger(days) ||
    !Number.isSafeInteger(hours) ||
    !Number.isSafeInteger(minutes) ||
    days < 0 ||
    hours < 0 ||
    minutes < 0
  ) return null;

  const durationMs = days * DAY_MS + hours * HOUR_MS + minutes * MINUTE_MS;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) return null;
  return Number.isNaN(new Date(Date.now() + durationMs).getTime()) ? null : durationMs;
}

function getTotalDurationMs(event: Pick<XpEvent, "startedAt" | "endsAt">): number {
  return Math.max(0, event.endsAt.getTime() - event.startedAt.getTime());
}

function getEventEmoji(
  guild: Guild | null | undefined,
  candidates: string[],
  fallback: string,
): string {
  return guild ? findGuildEmoji(guild, candidates, fallback) : fallback;
}

function findGuildEmoji(guild: Guild, candidates: string[], fallback: string): string {
  const candidateSet = new Set(candidates.map((name) => name.toLowerCase()));
  const emoji = guild.emojis.cache.find((entry) => candidateSet.has(entry.name?.toLowerCase() ?? ""));
  return emoji?.toString() ?? fallback;
}

export function buildXpEventAnnouncement(
  guild: Guild,
  event: Pick<XpEvent, "multiplier" | "endsAt" | "hostId" | "startedAt">,
): string {
  const rocket = findGuildEmoji(guild, ["rocket", "overdrive"], "🚀");
  const celebration = findGuildEmoji(guild, ["party", "celebration", "shine"], "🎉");
  const lightning = findGuildEmoji(guild, ["lightning", "bolt"], "⚡");
  const clock = findGuildEmoji(guild, ["clock", "time"], "⏰");
  const crown = findGuildEmoji(guild, ["crown", "king"], "👑");
  const fire = findGuildEmoji(guild, ["fire", "flame"], "🔥");
  const hourglass = findGuildEmoji(guild, ["hourglass", "duration"], "⌛");
  return [
    `${rocket} XP OVERDRIVE IS LIVE! ${rocket}`,
    "",
    `«${celebration} The XP boost has officially landed!`,
    "Your journey to the next level just got a whole lot faster!",
    "",
    `✅ Status: **Active**`,
    `${lightning} Boost: **${event.multiplier}× XP**`,
    `${hourglass} Total duration: **${formatXpEventDuration(getTotalDurationMs(event))}**`,
    `${clock} Ends: ${formatExactTimestamp(event.endsAt)}`,
    `${clock} Time remaining: ${formatRelativeTimestamp(event.endsAt)}`,
    `${crown} Hosted by: <@${event.hostId}>`,
    "",
    `${fire} Jump in and start stacking XP!»`,
  ].join("\n");
}

function buildEndedAnnouncement(guild: Guild | null | undefined, event: XpEvent, cancelled: boolean): string {
  const rocket = getEventEmoji(guild, ["rocket", "overdrive"], "🚀");
  const stop = getEventEmoji(guild, ["stop", "cancel", "warning"], "🛑");
  const sleep = getEventEmoji(guild, ["sleep", "moon"], "💤");
  const lightning = getEventEmoji(guild, ["lightning", "bolt"], "⚡");
  const hourglass = getEventEmoji(guild, ["hourglass", "duration"], "⌛");
  const clock = getEventEmoji(guild, ["clock", "time"], "⏰");
  const crown = getEventEmoji(guild, ["crown", "king"], "👑");
  const status = cancelled ? "Inactive (cancelled)" : "Inactive (ended)";
  const reason = cancelled ? "The XP boost has been cancelled." : "The scheduled XP boost has ended.";
  return [
    cancelled ? `${stop} XP OVERDRIVE WAS CANCELLED` : `${sleep} XP OVERDRIVE HAS ENDED`,
    "",
    reason,
    "",
    `Status: **${status}**`,
    `${lightning} Boost: **${event.multiplier}× XP**`,
    `${hourglass} Total duration: **${formatXpEventDuration(getTotalDurationMs(event))}**`,
    `${clock} Scheduled end: ${formatExactTimestamp(event.endsAt)}`,
    `${clock} Time remaining: ${cancelled ? "Not applicable (cancelled)" : "0 minutes"}`,
    `${crown} Hosted by: <@${event.hostId}>`,
    `${rocket} XP boost is no longer active.`,
  ].join("\n");
}

async function findAnnouncementChannel(
  client: Client,
  event: XpEvent,
): Promise<GuildTextBasedChannel | null> {
  const channel = await client.channels.fetch(event.announcementChannelId).catch(() => null);
  if (!channel?.isTextBased() || !("guildId" in channel) || channel.guildId !== event.guildId) return null;
  return channel as GuildTextBasedChannel;
}

export async function syncAnnouncement(
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
    : buildEndedAnnouncement(guild, event, state === "cancelled");
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

export async function startXpEventScheduler(client: Client): Promise<void> {
  try {
    await getXpEventRuntime(client).restore();
  } catch (error) {
    logger.error({ err: error }, "Failed to restore XP event schedule");
  }
}

async function getLiveEvent(client: Client, guildId: string): Promise<XpEvent | null> {
  return getXpEventRuntime(client).getLiveEvent(guildId);
}

export async function getActiveXpMultiplier(client: Client, guildId: string): Promise<number> {
  return getXpEventRuntime(client).getActiveXpMultiplier(guildId);
}

function buildEventDetails(
  guild: Guild | null | undefined,
  event: XpEvent,
  status: string,
  remainingTime = formatRelativeTimestamp(event.endsAt),
): string[] {
  const check = getEventEmoji(guild, ["check", "success", "active"], "✅");
  const lightning = getEventEmoji(guild, ["lightning", "bolt"], "⚡");
  const hourglass = getEventEmoji(guild, ["hourglass", "duration"], "⌛");
  const clock = getEventEmoji(guild, ["clock", "time"], "⏰");
  const crown = getEventEmoji(guild, ["crown", "king"], "👑");
  return [
    `${check} **Status:** ${status}`,
    `${lightning} **Boost:** ${event.multiplier}× XP`,
    `${hourglass} **Total duration:** ${formatXpEventDuration(getTotalDurationMs(event))}`,
    `${clock} **Ends:** ${formatExactTimestamp(event.endsAt)}`,
    `${clock} **Time remaining:** ${remainingTime}`,
    `${crown} **Hosted by:** <@${event.hostId}>`,
  ];
}

function buildStatusEmbed(guild: Guild | null | undefined, event: XpEvent | null): EmbedBuilder {
  if (!event) {
    const sleep = getEventEmoji(guild, ["sleep", "moon"], "💤");
    const rocket = getEventEmoji(guild, ["rocket", "overdrive"], "🚀");
    return new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${sleep} NO XP EVENT`)
      .setDescription(`**Status:** Inactive\n\n«There is currently no XP boost running. Stay tuned for the next one! ${rocket}»`);
  }
  const rocket = getEventEmoji(guild, ["rocket", "overdrive"], "🚀");
  return new EmbedBuilder()
    .setColor(0x57f287)
    .setTitle(`${rocket} XP OVERDRIVE IS LIVE!`)
    .addFields(
  { name: "Status", value: "✅ Active", inline: true },
  { name: "Boost", value: `⚡ ${event.multiplier}× XP`, inline: true },
  { name: "Duration", value: `⌛ ${formatXpEventDuration(getTotalDurationMs(event))}`, inline: false },
  { name: "Ends", value: `⏰ ${formatExactTimestamp(event.endsAt)}`, inline: true },
  { name: "Time Remaining", value: `⏰ ${formatRelativeTimestamp(event.endsAt)}`, inline: true },
  { name: "Hosted By", value: `👑 <@${event.hostId}>`, inline: false },
)
.setFooter({ text: "🔥 Jump in and start stacking XP!" });
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

function buildStartConfirmation(
  session: AdminSession,
  guild?: Guild | null,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const draft = session.draft!;
  const estimateEnd = new Date(Date.now() + draft.durationMs);
  const rocket = getEventEmoji(guild, ["rocket", "overdrive"], "🚀");
  const hourglass = getEventEmoji(guild, ["hourglass", "duration"], "⌛");
  const clock = getEventEmoji(guild, ["clock", "time"], "⏰");
  const lightning = getEventEmoji(guild, ["lightning", "bolt"], "⚡");
  const crown = getEventEmoji(guild, ["crown", "king"], "👑");
  const embed = new EmbedBuilder()
    .setColor(0xfee75c)
    .setTitle(`${rocket} Confirm XP Event`)
    .setDescription([
      "Status: **Pending confirmation (inactive)**",
      `${lightning} **Boost:** ${draft.multiplier}× XP`,
      `${hourglass} **Total duration:** ${formatXpEventDuration(draft.durationMs)}`,
      `${clock} **Ends:** ${formatExactTimestamp(estimateEnd)}`,
      `${clock} **Time remaining:** ${formatRelativeTimestamp(estimateEnd)}`,
      `${crown} **Hosted by:** <@${session.adminId}>`,
    ].join("\n"));
  const id = (action: string) => `xpevent:${session.id}:${action}`;
  return {
    embeds: [embed],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(id("start-confirm")).setLabel("Confirm & Start").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(id("refresh")).setLabel("Back to Panel").setStyle(ButtonStyle.Secondary),
    )],
  };
}

function buildCancelConfirmation(
  session: AdminSession,
  event: XpEvent,
  guild?: Guild | null,
): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const id = (action: string) => `xpevent:${session.id}:${action}`;
  const stop = getEventEmoji(guild, ["stop", "cancel", "warning"], "🛑");
  const description = [
    "The active boost will stop immediately and its announcement will be updated.",
    "",
    ...buildEventDetails(guild, event, "Active"),
  ].join("\n");
  return {
    embeds: [new EmbedBuilder().setColor(0xed4245).setTitle(`${stop} Cancel XP Event?`).setDescription(description)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(id("cancel-confirm")).setLabel("Confirm Cancellation").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(id("refresh")).setLabel("Keep Event").setStyle(ButtonStyle.Secondary),
    )],
  };
}

function splitDurationMs(durationMs: number): { days: number; hours: number; minutes: number } {
  const totalMinutes = Math.max(1, Math.ceil(durationMs / MINUTE_MS));
  return {
    days: Math.floor(totalMinutes / (24 * 60)),
    hours: Math.floor((totalMinutes % (24 * 60)) / 60),
    minutes: totalMinutes % 60,
  };
}

function buildConfigureModal(session: AdminSession, event: XpEvent | null): ModalBuilder {
  const duration = splitDurationMs(event ? event.endsAt.getTime() - Date.now() : DAY_MS);
  const durationInput = (customId: string, label: string, value: number) =>
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(16)
        .setValue(String(value)),
    );
  return new ModalBuilder()
    .setCustomId(`xpevent:${session.id}:configure-submit`)
    .setTitle(event ? "Change / Extend XP Event" : "Configure XP Event")
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("xp_multiplier")
          .setLabel("XP multiplier (2–10,000)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(5)
          .setValue(String(event?.multiplier ?? 25)),
      ),
      durationInput("xp_duration_days", "Duration in days", duration.days),
      durationInput("xp_duration_hours", "Duration in hours", duration.hours),
      durationInput("xp_duration_minutes", "Duration in minutes", duration.minutes),
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
  const embed = buildStatusEmbed(interaction.guild, event);
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
  const daysText = interaction.fields.getTextInputValue("xp_duration_days").trim();
  const hoursText = interaction.fields.getTextInputValue("xp_duration_hours").trim();
  const minutesText = interaction.fields.getTextInputValue("xp_duration_minutes").trim();
  const multiplier = Number(multiplierText);
  if (
    !/^\d+$/.test(multiplierText) ||
    !Number.isSafeInteger(multiplier) ||
    multiplier < MIN_XP_EVENT_MULTIPLIER ||
    multiplier > MAX_XP_EVENT_MULTIPLIER
  ) {
    await interaction.reply({
      content: `Multiplier must be a whole number from ${MIN_XP_EVENT_MULTIPLIER} to ${MAX_XP_EVENT_MULTIPLIER}.`,
      ephemeral: true,
    });
    return;
  }
  const durationMs = parseXpEventDuration(daysText, hoursText, minutesText);
  if (durationMs === null) {
    await interaction.reply({
      content: "Days, hours, and minutes must each be non-negative whole numbers (0 is allowed), and the total duration must be at least 1 minute.",
      ephemeral: true,
    });
    return;
  }
  const endsAt = new Date(Date.now() + durationMs);
  const current = await getLiveEvent(interaction.client, session.guildId);
  if (current) {
    const result = await getXpEventRuntime(interaction.client).updateActiveEvent(
      session.guildId,
      multiplier,
      endsAt,
    );
    if (!result) {
      await updatePanel(interaction, session, "The event ended before the update could be saved.");
      return;
    }
    await updatePanel(
      interaction,
      session,
      result.announcementSynced
        ? "Event updated."
        : "Event updated, but its announcement could not be reached. Use Refresh to retry.",
    );
    return;
  }
  session.draft = { multiplier, durationMs };
  await interaction.reply({ ...buildStartConfirmation(session, interaction.guild), ephemeral: true });
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
        embeds: [buildStatusEmbed(interaction.guild, null)],
        components: buildAdminComponents(session, false),
      });
      return;
    }
    await interaction.update(buildCancelConfirmation(session, event, interaction.guild));
    return;
  }
  if (action === "cancel-confirm") {
    const result = await getXpEventRuntime(interaction.client).cancelActiveEvent(session.guildId);
    if (!result) {
      await updatePanel(interaction, session, "There is no active event to cancel.");
      return;
    }
    await updatePanel(
      interaction,
      session,
      result.announcementSynced
        ? "Event cancelled."
        : "Event cancelled, but its announcement could not be reached.",
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
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + draft.durationMs);
    if (Number.isNaN(endsAt.getTime())) {
      await updatePanel(interaction, session, "That duration is too large to schedule. Configure a shorter duration.");
      return;
    }
    const announcement = await (channel as GuildTextBasedChannel)
      .send({
        content: buildXpEventAnnouncement(guild, {
          multiplier: draft.multiplier,
          endsAt,
          hostId: session.adminId,
          startedAt,
        }),
      })
      .catch((error) => {
        logger.error({ err: error, guildId: session.guildId }, "Failed to send XP event announcement");
        return null;
      });
    if (!announcement) {
      await updatePanel(interaction, session, "I couldn't send the announcement. Check my Send Messages permission and try again.");
      return;
    }
    let started: XpEvent | null;
    try {
      started = await startXpEvent({
        guildId: session.guildId,
        multiplier: draft.multiplier,
        endsAt,
        hostId: session.adminId,
        startedAt,
        announcementChannelId: channel.id,
        announcementMessageId: announcement.id,
      });
    } catch (error) {
      await announcement.delete().catch(() => {});
      throw error;
    }
    if (!started) {
      await announcement.delete().catch(() => {});
      session.draft = undefined;
      await updatePanel(interaction, session, "An event was started by another administrator first.");
      return;
    }
    session.draft = undefined;
    getXpEventRuntime(interaction.client).schedule(started);
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
    embeds: [buildStatusEmbed(interaction.guild, event)],
    components: buildAdminComponents(session, Boolean(event)),
    ephemeral: true,
  });
}

export async function sendPublicXpEventStatus(message: Message): Promise<void> {
  if (!message.guild) return;
  const event = await getLiveEvent(message.client, message.guild.id);
  await message.reply({ embeds: [buildStatusEmbed(message.guild, event)] });
}
