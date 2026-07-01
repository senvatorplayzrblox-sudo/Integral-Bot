import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Attachment,
  type GuildMember,
  type GuildTextBasedChannel,
  type Interaction,
  type Message,
} from "discord.js";
import { getGuildConfig, updateGuildConfig, type GuildConfig } from "../db/models/GuildConfig.js";
import { logger } from "./logger.js";

// ── Session State ──────────────────────────────────────────────────────────

interface WelcomeSetupSession {
  guildId: string;
  userId: string;
  setupMessageId: string;
  setupChannelId: string;
  aboveText: string;
  title: string;
  description: string;
  footer: string;
  bannerUrl: string | null;
  color: number;
  bannerCollector: { stop(): void } | null;
}

const sessions = new Map<string, WelcomeSetupSession>();

function sessionKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

export function initSession(
  guildId: string,
  userId: string,
  messageId: string,
  channelId: string,
  config: GuildConfig,
): void {
  sessions.set(sessionKey(guildId, userId), {
    guildId,
    userId,
    setupMessageId: messageId,
    setupChannelId: channelId,
    aboveText: config.welcomeAboveText ?? "",
    title: config.welcomeTitle ?? "",
    description: config.welcomeDescription ?? "",
    footer: config.welcomeFooter ?? "",
    bannerUrl: config.welcomeBanner ?? null,
    color: config.welcomeColor ?? 0x5865f2,
    bannerCollector: null,
  });
}

function getSession(guildId: string, userId: string): WelcomeSetupSession | undefined {
  return sessions.get(sessionKey(guildId, userId));
}

function saveSession(session: WelcomeSetupSession): void {
  sessions.set(sessionKey(session.guildId, session.userId), session);
}

function clearSession(guildId: string, userId: string): void {
  sessions.get(sessionKey(guildId, userId))?.bannerCollector?.stop();
  sessions.delete(sessionKey(guildId, userId));
}

// ── Variable Resolution ────────────────────────────────────────────────────

export function resolveVars(template: string, member: GuildMember): string {
  return template
    .replace(/\{mention\}/g, `<@${member.id}>`)
    .replace(/\{user\}/g, member.user.username)
    .replace(/\{username\}/g, member.user.username)
    .replace(/\{displayname\}/g, member.displayName)
    .replace(/\{server\}/g, member.guild.name)
    .replace(/\{membercount\}/g, String(member.guild.memberCount))
    .replace(/\{id\}/g, member.id);
}

// ── Embed / Message Builder ────────────────────────────────────────────────

export function buildWelcomeEmbed(
  opts: {
    title: string | null;
    description: string | null;
    footer: string | null;
    bannerUrl: string | null;
    color: number;
  },
  member: GuildMember,
): EmbedBuilder {
  const embed = new EmbedBuilder().setColor(opts.color);

  if (opts.title) embed.setTitle(opts.title);

  if (opts.description) {
    embed.setDescription(resolveVars(opts.description, member));
  }

  embed.setThumbnail(member.displayAvatarURL());

  if (opts.footer) {
    embed.setFooter({ text: resolveVars(opts.footer, member) });
  }

  if (opts.bannerUrl) embed.setImage(opts.bannerUrl);

  return embed;
}

// ── Shared Send Helper ────────────────────────────────────────────────────

export async function sendWelcomeMessage(
  config: GuildConfig,
  member: GuildMember,
  channel: GuildTextBasedChannel,
): Promise<void> {
  const aboveText = config.welcomeAboveText
    ? resolveVars(config.welcomeAboveText, member)
    : null;

  const embed = buildWelcomeEmbed(
    {
      title:       config.welcomeTitle,
      description: config.welcomeDescription,
      footer:      config.welcomeFooter,
      bannerUrl:   config.welcomeBanner,
      color:       config.welcomeColor,
    },
    member,
  );

  await channel.send({
    ...(aboveText ? { content: aboveText } : {}),
    embeds: [embed],
  });
}

// ── Attachment Validation ──────────────────────────────────────────────────

function isImageAttachment(attachment: Attachment): boolean {
  const ct = attachment.contentType ?? "";
  const ext = (attachment.name ?? "").split(".").pop()?.toLowerCase() ?? "";
  return (
    ct.startsWith("image/png") ||
    ct.startsWith("image/jpeg") ||
    ct.startsWith("image/webp") ||
    ct.startsWith("image/gif") ||
    ["png", "jpg", "jpeg", "webp", "gif"].includes(ext)
  );
}

// ── Color Map ──────────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, number> = {
  default: 0x99aab5,
  blurple: 0x5865f2,
  blue:    0x3498db,
  green:   0x2ecc71,
  yellow:  0xf1c40f,
  red:     0xe74c3c,
  purple:  0x9b59b6,
};

// ── UI Payload Builders ────────────────────────────────────────────────────

type Payload = {
  content: string;
  embeds: EmbedBuilder[];
  components: ActionRowBuilder<ButtonBuilder>[];
};

export function buildSetupPanelPayload(config: GuildConfig): Payload {
  const embed = new EmbedBuilder()
    .setTitle("Welcome System")
    .setColor(0x5865f2)
    .addFields(
      {
        name: "Status",
        value: config.welcomeEnabled ? "🟢 Enabled" : "🔴 Disabled",
        inline: true,
      },
      {
        name: "Current Channel",
        value: config.welcomeChannelId ? `<#${config.welcomeChannelId}>` : "Not set",
        inline: true,
      },
    );

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_customize")
      .setLabel("Customize")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ws_preview")
      .setLabel("Preview")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_reset")
      .setLabel("Reset")
      .setStyle(ButtonStyle.Danger),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_toggle")
      .setLabel(config.welcomeEnabled ? "Disable" : "Enable")
      .setStyle(config.welcomeEnabled ? ButtonStyle.Danger : ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ws_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [row1, row2] };
}

function buildBannerStepPayload(): Payload {
  const embed = new EmbedBuilder()
    .setTitle("Step 2 — Banner Image")
    .setColor(0x5865f2)
    .setDescription(
      "Would you like to upload a banner image for the welcome embed?\n\nSupported formats: PNG, JPG, JPEG, WEBP, GIF",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_banner_upload")
      .setLabel("Upload Banner")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("ws_banner_skip")
      .setLabel("Skip Banner")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [row] };
}

function buildBannerUploadCardPayload(): Payload {
  const embed = new EmbedBuilder()
    .setTitle("📷 Upload Welcome Banner")
    .setColor(0x5865f2)
    .setDescription(
      "Use the **+** attachment button (or drag and drop) to upload your banner image.\n\n" +
      "**Accepted formats:**\n" +
      "› PNG  › JPG  › JPEG  › WEBP  › GIF\n\n" +
      "*The bot will automatically detect and save your image.*",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_banner_card_back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_banner_card_skip")
      .setLabel("Skip")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_banner_card_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return { content: "", embeds: [embed], components: [row] };
}

function buildBannerSuccessPayload(bannerUrl: string): Payload {
  const embed = new EmbedBuilder()
    .setTitle("✅ Banner Uploaded Successfully")
    .setColor(0x57f287)
    .setDescription("Your banner has been saved to the current setup session.")
    .setImage(bannerUrl);

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_banner_continue")
      .setLabel("Continue")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ws_banner_replace")
      .setLabel("Replace Banner")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_banner_remove")
      .setLabel("Remove Banner")
      .setStyle(ButtonStyle.Danger),
  );

  return { content: "", embeds: [embed], components: [row] };
}

function startBannerCollector(
  channel: GuildTextBasedChannel,
  session: WelcomeSetupSession,
): void {
  const { guildId, userId } = session;

  const collector = channel.createMessageCollector({
    filter: (m: Message) =>
      m.author.id === userId &&
      m.attachments.size > 0 &&
      isImageAttachment(m.attachments.first()!),
    max: 1,
  });

  session.bannerCollector = collector;
  saveSession(session);

  collector.on("collect", async (msg: Message) => {
    const attachment = msg.attachments.first()!;
    const fresh = getSession(guildId, userId);
    if (!fresh) return;

    fresh.bannerUrl = attachment.url;
    fresh.bannerCollector = null;
    saveSession(fresh);

    try {
      const setupMsg = await channel.messages.fetch(fresh.setupMessageId);
      await setupMsg.edit(buildBannerSuccessPayload(attachment.url));
      await msg.react("✅").catch(() => {});
    } catch (err) {
      logger.error({ err }, "Failed to update setup message after banner upload");
    }
  });
}

function buildColorStepPayload(): Payload {
  const embed = new EmbedBuilder()
    .setTitle("Step 3 — Embed Color")
    .setColor(0x5865f2)
    .setDescription("Choose a color for the welcome embed.");

  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ws_color_default").setLabel("Default").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ws_color_blurple").setLabel("Blurple").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ws_color_blue").setLabel("Blue").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("ws_color_green").setLabel("Green").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("ws_color_yellow").setLabel("Yellow").setStyle(ButtonStyle.Secondary),
  );

  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId("ws_color_red").setLabel("Red").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("ws_color_purple").setLabel("Purple").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("ws_color_custom").setLabel("Custom HEX").setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [row1, row2] };
}

function buildPreviewStepPayload(): Payload {
  const embed = new EmbedBuilder()
    .setTitle("Step 4 — Preview & Save")
    .setColor(0x5865f2)
    .setDescription(
      "Click **Send Preview** to see exactly what members will receive.\nClick **Save** to commit the configuration.",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_preview_send")
      .setLabel("Send Preview")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_preview_save")
      .setLabel("Save")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("ws_preview_back")
      .setLabel("Back")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("ws_preview_cancel")
      .setLabel("Cancel")
      .setStyle(ButtonStyle.Danger),
  );

  return { content: "", embeds: [embed], components: [row] };
}

function buildResetConfirmPayload(): Payload {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ Reset Welcome Configuration")
    .setColor(0xe74c3c)
    .setDescription(
      "This will delete all welcome customization (message, title, description, banner, color).\n\n" +
      "**The welcome channel setting will be kept.**\n\nAre you sure?",
    );

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("ws_reset_yes")
      .setLabel("Yes, Reset")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("ws_reset_no")
      .setLabel("No, Cancel")
      .setStyle(ButtonStyle.Secondary),
  );

  return { content: "", embeds: [embed], components: [row] };
}

// ── Interaction Handler ────────────────────────────────────────────────────

export async function handleWelcomeInteraction(interaction: Interaction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) return;
  if (!interaction.isButton() && !interaction.isModalSubmit()) return;

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const customId = interaction.customId;

  // ── Button Interactions ──────────────────────────────────────────────────

  if (interaction.isButton()) {

    // Main panel — Customize: open Step 1 modal
    if (customId === "ws_customize") {
      const session = getSession(guildId, userId);

      const modal = new ModalBuilder()
        .setCustomId("ws_modal_step1")
        .setTitle("Customize Welcome Message")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("aboveText")
              .setLabel("Message Above Embed")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Warm greetings {mention}! 🕸️")
              .setValue(session?.aboveText ?? "")
              .setRequired(false),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("title")
              .setLabel("Embed Title")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Welcome to our server!")
              .setValue(session?.title ?? "")
              .setRequired(false),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("description")
              .setLabel("Embed Description")
              .setStyle(TextInputStyle.Paragraph)
              .setPlaceholder("Welcome {mention}\nPlease read the rules\nEnjoy your stay ❤️")
              .setValue(session?.description ?? "")
              .setRequired(false),
          ),
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("footer")
              .setLabel("Footer (optional)")
              .setStyle(TextInputStyle.Short)
              .setPlaceholder("Member #{membercount}")
              .setValue(session?.footer ?? "")
              .setRequired(false),
          ),
        );

      await interaction.showModal(modal);
      return;
    }

    // Main panel — Preview: send current saved config as ephemeral preview
    if (customId === "ws_preview") {
      const config = await getGuildConfig(guildId);
      const member = await interaction.guild?.members.fetch(userId).catch(() => null);

      if (!member) {
        await interaction.reply({ content: "❌ Could not fetch your member data.", ephemeral: true });
        return;
      }

      if (!config.welcomeTitle && !config.welcomeDescription) {
        await interaction.reply({
          content: "❌ No welcome message configured yet. Use **Customize** first.",
          ephemeral: true,
        });
        return;
      }

      const aboveText = config.welcomeAboveText ? resolveVars(config.welcomeAboveText, member) : null;
      const embed = buildWelcomeEmbed(
        {
          title: config.welcomeTitle,
          description: config.welcomeDescription,
          footer: config.welcomeFooter,
          bannerUrl: config.welcomeBanner,
          color: config.welcomeColor,
        },
        member,
      );

      await interaction.reply({
        content: aboveText ? `**Preview — Message Above Embed:**\n${aboveText}\n** **` : "**Preview:**",
        embeds: [embed],
        ephemeral: true,
      });
      return;
    }

    // Main panel — Reset: show confirmation
    if (customId === "ws_reset") {
      await interaction.update(buildResetConfirmPayload());
      return;
    }

    // Reset confirmed
    if (customId === "ws_reset_yes") {
      await updateGuildConfig(guildId, {
        welcomeAboveText: null,
        welcomeTitle: null,
        welcomeDescription: null,
        welcomeFooter: null,
        welcomeBanner: null,
        welcomeColor: 0x5865f2,
      });
      clearSession(guildId, userId);
      const config = await getGuildConfig(guildId);
      const payload = buildSetupPanelPayload(config);
      await interaction.update({ ...payload, content: "✅ Welcome configuration has been reset." });
      return;
    }

    // Reset cancelled
    if (customId === "ws_reset_no") {
      const config = await getGuildConfig(guildId);
      await interaction.update(buildSetupPanelPayload(config));
      return;
    }

    // Main panel — Toggle enabled/disabled
    if (customId === "ws_toggle") {
      const config = await getGuildConfig(guildId);
      await updateGuildConfig(guildId, { welcomeEnabled: !config.welcomeEnabled });
      const updated = await getGuildConfig(guildId);
      await interaction.update(buildSetupPanelPayload(updated));
      return;
    }

    // Main panel — Cancel
    if (customId === "ws_cancel") {
      clearSession(guildId, userId);
      await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] });
      return;
    }

    // Step 2 — Upload Banner: show polished upload card, start attachment collector
    if (customId === "ws_banner_upload") {
      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      session.bannerCollector?.stop();
      await interaction.update(buildBannerUploadCardPayload());

      const channel = interaction.channel as GuildTextBasedChannel | null;
      if (!channel?.isTextBased()) return;

      startBannerCollector(channel, session);
      return;
    }

    // Step 2 — Upload card: Back → return to Upload/Skip choice
    if (customId === "ws_banner_card_back") {
      const session = getSession(guildId, userId);
      if (session) {
        session.bannerCollector?.stop();
        session.bannerCollector = null;
        saveSession(session);
      }
      await interaction.update(buildBannerStepPayload());
      return;
    }

    // Step 2 — Upload card: Skip → clear banner, advance to color
    if (customId === "ws_banner_card_skip") {
      const session = getSession(guildId, userId);
      if (session) {
        session.bannerCollector?.stop();
        session.bannerCollector = null;
        session.bannerUrl = null;
        saveSession(session);
      }
      await interaction.update(buildColorStepPayload());
      return;
    }

    // Step 2 — Upload card: Cancel
    if (customId === "ws_banner_card_cancel") {
      clearSession(guildId, userId);
      await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] });
      return;
    }

    // Step 2 — After upload: Continue to color step
    if (customId === "ws_banner_continue") {
      await interaction.update(buildColorStepPayload());
      return;
    }

    // Step 2 — After upload: Replace Banner → show upload card again with new collector
    if (customId === "ws_banner_replace") {
      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      session.bannerCollector?.stop();
      await interaction.update(buildBannerUploadCardPayload());

      const channel = interaction.channel as GuildTextBasedChannel | null;
      if (!channel?.isTextBased()) return;

      startBannerCollector(channel, session);
      return;
    }

    // Step 2 — After upload: Remove Banner → clear and return to banner choice
    if (customId === "ws_banner_remove") {
      const session = getSession(guildId, userId);
      if (session) {
        session.bannerUrl = null;
        saveSession(session);
      }
      await interaction.update(buildBannerStepPayload());
      return;
    }

    // Step 2 — Skip Banner (from the initial banner choice)
    if (customId === "ws_banner_skip") {
      const session = getSession(guildId, userId);
      if (session) {
        session.bannerUrl = null;
        saveSession(session);
      }
      await interaction.update(buildColorStepPayload());
      return;
    }

    // Step 3 — Color buttons
    if (customId.startsWith("ws_color_")) {
      const colorKey = customId.slice("ws_color_".length);

      if (colorKey === "custom") {
        const modal = new ModalBuilder()
          .setCustomId("ws_modal_hex")
          .setTitle("Custom Embed Color")
          .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
              new TextInputBuilder()
                .setCustomId("hex")
                .setLabel("HEX Color Code")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("#5865F2")
                .setMinLength(4)
                .setMaxLength(7)
                .setRequired(true),
            ),
          );
        await interaction.showModal(modal);
        return;
      }

      const color = COLOR_MAP[colorKey];
      if (color !== undefined) {
        const session = getSession(guildId, userId);
        if (session) {
          session.color = color;
          saveSession(session);
        }
      }

      await interaction.update(buildPreviewStepPayload());
      return;
    }

    // Step 4 — Send Preview (visible to channel)
    if (customId === "ws_preview_send") {
      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      const member = await interaction.guild?.members.fetch(userId).catch(() => null);
      if (!member) {
        await interaction.reply({ content: "❌ Could not fetch your member data.", ephemeral: true });
        return;
      }

      const aboveText = session.aboveText ? resolveVars(session.aboveText, member) : null;
      const embed = buildWelcomeEmbed(
        {
          title: session.title || null,
          description: session.description || null,
          footer: session.footer || null,
          bannerUrl: session.bannerUrl,
          color: session.color,
        },
        member,
      );

      // Acknowledge the button so it doesn't time out, then send preview as a follow-up
      await interaction.deferUpdate();
      await interaction.followUp({
        content: aboveText ?? undefined,
        embeds: [embed],
      });
      return;
    }

    // Step 4 — Save to DB
    if (customId === "ws_preview_save") {
      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      await updateGuildConfig(guildId, {
        welcomeAboveText:   session.aboveText || null,
        welcomeTitle:       session.title || null,
        welcomeDescription: session.description || null,
        welcomeFooter:      session.footer || null,
        welcomeBanner:      session.bannerUrl,
        welcomeColor:       session.color,
      });

      clearSession(guildId, userId);

      await interaction.update({
        content: "✅ Welcome configuration saved successfully.",
        embeds: [],
        components: [],
      });
      return;
    }

    // Step 4 — Back to color
    if (customId === "ws_preview_back") {
      await interaction.update(buildColorStepPayload());
      return;
    }

    // Step 4 — Cancel
    if (customId === "ws_preview_cancel") {
      clearSession(guildId, userId);
      await interaction.update({ content: "Setup cancelled.", embeds: [], components: [] });
      return;
    }
  }

  // ── Modal Submits ────────────────────────────────────────────────────────

  if (interaction.isModalSubmit()) {

    // Step 1 modal submitted — save to session, advance setup panel to Step 2
    if (customId === "ws_modal_step1") {
      const aboveText   = interaction.fields.getTextInputValue("aboveText").trim();
      const title       = interaction.fields.getTextInputValue("title").trim();
      const description = interaction.fields.getTextInputValue("description").trim();
      const footer      = interaction.fields.getTextInputValue("footer").trim();

      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      saveSession({ ...session, aboveText, title, description, footer });

      // Acknowledge the modal, then update the setup message
      await interaction.deferReply({ ephemeral: true });

      try {
        const channel = interaction.guild?.channels.cache.get(session.setupChannelId);
        if (channel?.isTextBased()) {
          const setupMsg = await channel.messages.fetch(session.setupMessageId);
          await setupMsg.edit(buildBannerStepPayload());
        }
      } catch (err) {
        logger.error({ err }, "Failed to advance setup panel after step1 modal");
      }

      try {
        await interaction.deleteReply();
      } catch {
        // Ephemeral replies may not always be deletable — safe to ignore
      }
      return;
    }

    // HEX color modal submitted
    if (customId === "ws_modal_hex") {
      const raw    = interaction.fields.getTextInputValue("hex").trim().replace(/^#/, "");
      const parsed = parseInt(raw, 16);

      if (!/^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(raw) || isNaN(parsed)) {
        await interaction.reply({
          content: "❌ Invalid HEX code. Example: `#5865F2` or `#FFF`",
          ephemeral: true,
        });
        return;
      }

      const session = getSession(guildId, userId);
      if (!session) {
        await interaction.reply({
          content: "❌ Session expired. Run `&welcomesetup` again.",
          ephemeral: true,
        });
        return;
      }

      saveSession({ ...session, color: parsed });

      await interaction.deferReply({ ephemeral: true });

      try {
        const channel = interaction.guild?.channels.cache.get(session.setupChannelId);
        if (channel?.isTextBased()) {
          const setupMsg = await channel.messages.fetch(session.setupMessageId);
          await setupMsg.edit(buildPreviewStepPayload());
        }
      } catch (err) {
        logger.error({ err }, "Failed to advance setup panel after hex modal");
      }

      try {
        await interaction.deleteReply();
      } catch {
        // Safe to ignore
      }
      return;
    }
  }
}
