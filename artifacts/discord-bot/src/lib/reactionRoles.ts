import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type Guild,
  type GuildMember,
  type Interaction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
} from "discord.js";
import { getReactionRoleConfig, type ReactionRoleConfig, type ReactionRoleEntry, updateReactionRoleConfig } from "../db/models/ReactionRoleConfig.js";
import { makeEmbed } from "./reply.js";

const MAX_REACTION_ROLES = 25;
const SESSION_TTL_MS = 30 * 60_000;

type ReactionRoleSession = {
  guildId: string;
  adminId: string;
  setupMessageId: string;
  setupChannelId: string;
  expiresAt: number;
  config: ReactionRoleConfig;
};

const sessions = new Map<string, ReactionRoleSession>();

function setupCustomId(action: string): string {
  return `rr:setup:${action}`;
}

export function publishedCustomId(guildId: string, roleId: string): string {
  return `rr:pick:${guildId}:${roleId}`;
}

export function getConfiguredRoleIdsToRemove(
  configuredRoleIds: string[],
  memberRoleIds: Set<string>,
  selectedRoleId: string,
): string[] {
  return configuredRoleIds.filter((roleId) => roleId !== selectedRoleId && memberRoleIds.has(roleId));
}

function buildPublishedEmbed(guild: Guild, config: ReactionRoleConfig): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(config.color)
    .setTitle(config.title || guild.name)
    .setDescription(config.description || "Choose one colour role below.");
  if (config.imageUrl) embed.setImage(config.imageUrl);
  return embed;
}

export function buildPublishedComponents(guildId: string, roles: ReactionRoleEntry[]) {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let index = 0; index < roles.length; index += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>();
    roles.slice(index, index + 5).forEach((role, offset) => {
      const label = `${index + offset + 1}. ${role.displayName}`.slice(0, 80);
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(publishedCustomId(guildId, role.roleId))
          .setLabel(label)
          .setStyle(ButtonStyle.Secondary),
      );
    });
    rows.push(row);
  }
  return rows;
}

function buildSetupEmbed(config: ReactionRoleConfig): EmbedBuilder {
  const roles = config.roles.length
    ? config.roles.map((role, index) => `${index + 1}. ${role.displayName} — \`${role.roleId}\``).join("\n")
    : "No colour roles added yet.";
  return new EmbedBuilder()
    .setColor(config.color)
    .setTitle("Integral — Reaction Roles Setup")
    .setDescription("Administrator-only setup. Published buttons are available to everyone.")
    .addFields(
      { name: "Title", value: config.title || "Not set", inline: true },
      { name: "Status", value: config.enabled ? "Enabled" : "Disabled", inline: true },
      { name: "Channel", value: config.channelId ? `<#${config.channelId}>` : "Not selected", inline: true },
      { name: "Colour Roles", value: roles },
    );
}

function buildSetupComponents(config: ReactionRoleConfig) {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(setupCustomId("customize")).setLabel("Customize").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(setupCustomId("add")).setLabel("Add Reaction Role").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(setupCustomId("preview")).setLabel("Preview").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(setupCustomId("save")).setLabel("Confirm / Send").setStyle(ButtonStyle.Success),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(setupCustomId("enable")).setLabel("Enable").setStyle(ButtonStyle.Success).setDisabled(!config.messageId),
      new ButtonBuilder().setCustomId(setupCustomId("disable")).setLabel("Disable").setStyle(ButtonStyle.Danger).setDisabled(!config.enabled),
    ),
  ];
}

export async function buildReactionRoleSetupPayload(guildId: string) {
  const config = await getReactionRoleConfig(guildId);
  return { embeds: [buildSetupEmbed(config)], components: buildSetupComponents(config) };
}

export async function startReactionRoleSession(
  guildId: string,
  adminId: string,
  setupMessageId: string,
  setupChannelId: string,
): Promise<void> {
  const config = await getReactionRoleConfig(guildId);
  sessions.set(guildId, {
    guildId,
    adminId,
    setupMessageId,
    setupChannelId,
    expiresAt: Date.now() + SESSION_TTL_MS,
    config,
  });
}

async function getSession(interaction: Interaction): Promise<ReactionRoleSession | null> {
  const guildId = interaction.guildId;
  if (!guildId) return null;
  const session = sessions.get(guildId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(guildId);
    return null;
  }
  const member = interaction.member as GuildMember | null;
  if (interaction.user.id !== session.adminId || !member?.permissions.has(PermissionFlagsBits.Administrator)) {
    return null;
  }
  return session;
}

async function refreshSetup(interaction: Interaction, session: ReactionRoleSession): Promise<void> {
  const channel = interaction.client.channels.cache.get(session.setupChannelId);
  if (!channel?.isTextBased()) return;
  const setupMessage = await channel.messages.fetch(session.setupMessageId).catch(() => null);
  await setupMessage?.edit({
    embeds: [buildSetupEmbed(session.config)],
    components: buildSetupComponents(session.config),
  });
}

function parseHex(value: string): number | null {
  const normalized = value.trim().replace(/^#/, "");
  return /^[0-9a-f]{6}$/i.test(normalized) ? Number.parseInt(normalized, 16) : null;
}

function parseId(value: string): string | null {
  return value.match(/\d{17,20}/)?.[0] ?? null;
}

async function botMember(guild: Guild): Promise<GuildMember | null> {
  return guild.members.me ?? guild.members.fetchMe().catch(() => null);
}

export async function validateRole(guild: Guild, roleId: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const role = guild.roles.cache.get(roleId);
  if (!role || role.id === guild.id) return { ok: false, reason: "That role does not exist or is @everyone." };
  if (role.managed) return { ok: false, reason: "That role is managed by a Discord integration." };
  const me = await botMember(guild);
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: "I can't do that because I don't have the required permission: Manage Roles." };
  }
  if (role.position >= me.roles.highest.position) {
    return { ok: false, reason: "That role is above or equal to Integral's highest role." };
  }
  return { ok: true };
}

async function handleSetupButton(interaction: ButtonInteraction, session: ReactionRoleSession): Promise<void> {
  const action = interaction.customId.split(":")[2];
  if (action === "customize") {
    const modal = new ModalBuilder().setCustomId(setupCustomId("customize-submit")).setTitle("Customize Reaction Roles");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_title").setLabel("Title").setStyle(TextInputStyle.Short).setRequired(true).setValue(session.config.title),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_description").setLabel("Description").setStyle(TextInputStyle.Paragraph).setRequired(true).setValue(session.config.description),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_color").setLabel("HEX colour").setStyle(TextInputStyle.Short).setRequired(true).setValue(`#${session.config.color.toString(16).padStart(6, "0")}`),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_image").setLabel("Image URL (optional)").setStyle(TextInputStyle.Short).setRequired(false).setValue(session.config.imageUrl ?? ""),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "add") {
    if (session.config.roles.length >= MAX_REACTION_ROLES) {
      await interaction.reply({ embeds: [makeEmbed("error", "Role Limit Reached", "Discord allows at most 25 reaction-role buttons.")], ephemeral: true });
      return;
    }
    const modal = new ModalBuilder().setCustomId(setupCustomId("add-submit")).setTitle("Add Colour Role");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_role_name").setLabel("Display name").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("rr_role_id").setLabel("Discord role ID or mention").setStyle(TextInputStyle.Short).setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (action === "preview") {
    await interaction.reply({
      embeds: [buildPublishedEmbed(interaction.guild!, session.config)],
      components: buildPublishedComponents(session.guildId, session.config.roles),
      ephemeral: true,
    });
    return;
  }

  if (action === "save") {
    if (session.config.roles.length === 0) {
      await interaction.reply({ embeds: [makeEmbed("error", "Add Roles First", "Add at least one colour role before publishing.")], ephemeral: true });
      return;
    }
    if (session.config.roles.length > MAX_REACTION_ROLES) {
      await interaction.reply({ embeds: [makeEmbed("error", "Role Limit Reached", "Discord allows at most 25 reaction-role buttons.")], ephemeral: true });
      return;
    }
    const channels = interaction.guild!.channels.cache
      .filter((channel) => channel.isTextBased() && !channel.isThread())
      .first(25);
    if (channels.length === 0) {
      await interaction.reply({ embeds: [makeEmbed("error", "No Text Channels", "I could not find a text channel to publish in.")], ephemeral: true });
      return;
    }
    const menu = new ChannelSelectMenuBuilder()
      .setCustomId(setupCustomId("channel-select"))
      .setPlaceholder("Select the published reaction-role channel")
      .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement);
    await interaction.reply({
      content: "Choose the channel for the permanent reaction-role message.",
      components: [new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(menu)],
      ephemeral: true,
    });
    return;
  }

  if (action === "enable" || action === "disable") {
    if (!session.config.messageId) {
      await interaction.reply({ embeds: [makeEmbed("error", "Publish First", "Use Confirm / Send before enabling reaction roles.")], ephemeral: true });
      return;
    }
    session.config.enabled = action === "enable";
    await updateReactionRoleConfig(session.guildId, { enabled: session.config.enabled });
    await interaction.update({ embeds: [buildSetupEmbed(session.config)], components: buildSetupComponents(session.config) });
  }
}

async function handleSetupModal(interaction: ModalSubmitInteraction, session: ReactionRoleSession): Promise<void> {
  const action = interaction.customId.split(":")[2];
  if (action === "customize-submit") {
    const color = parseHex(interaction.fields.getTextInputValue("rr_color"));
    if (color === null) {
      await interaction.reply({ embeds: [makeEmbed("error", "Invalid Colour", "Use a six-digit HEX colour such as `#5865F2`.")], ephemeral: true });
      return;
    }
    const image = interaction.fields.getTextInputValue("rr_image").trim();
    if (image && !/^https?:\/\//i.test(image)) {
      await interaction.reply({ embeds: [makeEmbed("error", "Invalid Image URL", "The image must use an HTTP or HTTPS URL.")], ephemeral: true });
      return;
    }
    session.config.title = interaction.fields.getTextInputValue("rr_title").trim().slice(0, 256);
    session.config.description = interaction.fields.getTextInputValue("rr_description").trim().slice(0, 4_000);
    session.config.color = color;
    session.config.imageUrl = image || null;
    await updateReactionRoleConfig(session.guildId, session.config);
    await interaction.reply({ embeds: [makeEmbed("success", "Customization Saved", "The reaction-role preview was updated.")], ephemeral: true });
    await refreshSetup(interaction, session);
    return;
  }

  if (action === "add-submit") {
    const roleId = parseId(interaction.fields.getTextInputValue("rr_role_id"));
    const displayName = interaction.fields.getTextInputValue("rr_role_name").trim().slice(0, 70);
    if (!roleId || !displayName) {
      await interaction.reply({ embeds: [makeEmbed("error", "Invalid Role", "Provide a display name and a valid Discord role ID.")], ephemeral: true });
      return;
    }
    if (session.config.roles.some((entry) => entry.roleId === roleId)) {
      await interaction.reply({ embeds: [makeEmbed("error", "Duplicate Role", "That role is already configured for this server.")], ephemeral: true });
      return;
    }
    const validation = await validateRole(interaction.guild!, roleId);
    if (!validation.ok) {
      await interaction.reply({ embeds: [makeEmbed("error", "Role Not Available", validation.reason)], ephemeral: true });
      return;
    }
    session.config.roles.push({ roleId, displayName });
    await updateReactionRoleConfig(session.guildId, { roles: session.config.roles });
    await interaction.reply({ embeds: [makeEmbed("success", "Reaction Role Added", `${displayName} was added to the setup.`)], ephemeral: true });
    await refreshSetup(interaction, session);
  }
}

async function publishReactionRoles(interaction: ChannelSelectMenuInteraction, session: ReactionRoleSession): Promise<void> {
  const channelId = interaction.values[0];
  const channel = interaction.guild!.channels.cache.get(channelId);
  if (!channel?.isTextBased() || channel.isThread()) {
    await interaction.update({ content: "That is not a valid text channel.", components: [] });
    return;
  }

  const me = await botMember(interaction.guild!);
  const permissions = me ? channel.permissionsFor(me) : null;
  if (!me || !permissions?.has(PermissionFlagsBits.ViewChannel) ||
      !permissions.has(PermissionFlagsBits.SendMessages) ||
      !permissions.has(PermissionFlagsBits.EmbedLinks)) {
    await interaction.update({
      content: "I can't publish there because I don't have the required permission: View Channel, Send Messages, and Embed Links.",
      components: [],
    });
    return;
  }

  for (const entry of session.config.roles) {
    const validation = await validateRole(interaction.guild!, entry.roleId);
    if (!validation.ok) {
      await interaction.update({ content: `Cannot publish: ${entry.displayName} — ${validation.reason}`, components: [] });
      return;
    }
  }

  let published = null;
  if (session.config.messageId && session.config.channelId === channelId) {
    const existing = await channel.messages.fetch(session.config.messageId).catch(() => null);
    if (existing) {
      published = await existing.edit({
        embeds: [buildPublishedEmbed(interaction.guild!, session.config)],
        components: buildPublishedComponents(session.guildId, session.config.roles),
      });
    }
  }
  if (!published) {
    if (session.config.messageId && session.config.channelId !== channelId) {
      const oldChannel = interaction.client.channels.cache.get(session.config.channelId ?? "");
      if (oldChannel?.isTextBased()) {
        const oldMessage = await oldChannel.messages.fetch(session.config.messageId).catch(() => null);
        await oldMessage?.delete().catch(() => {});
      }
    }
    published = await channel.send({
      embeds: [buildPublishedEmbed(interaction.guild!, session.config)],
      components: buildPublishedComponents(session.guildId, session.config.roles),
    });
  }

  session.config.channelId = channelId;
  session.config.messageId = published.id;
  await updateReactionRoleConfig(session.guildId, {
    channelId,
    messageId: published.id,
    roles: session.config.roles,
    title: session.config.title,
    description: session.config.description,
    color: session.config.color,
    imageUrl: session.config.imageUrl,
  });
  await interaction.update({ content: "Reaction-role message saved. Use the setup panel to enable or disable it.", components: [] });
  await refreshSetup(interaction, session);
}

async function handlePublishedButton(interaction: ButtonInteraction): Promise<void> {
  const [, , guildId, roleId] = interaction.customId.split(":");
  if (!interaction.guildId || interaction.guildId !== guildId) {
    await interaction.reply({ embeds: [makeEmbed("error", "Invalid Server", "That reaction role belongs to a different server.")], ephemeral: true });
    return;
  }
  const config = await getReactionRoleConfig(guildId);
  if (!config.enabled) {
    await interaction.reply({ embeds: [makeEmbed("warning", "Reaction Roles Disabled", "Reaction roles are currently disabled in this server.")], ephemeral: true });
    return;
  }
  const configuredIds = new Set(config.roles.map((entry) => entry.roleId));
  if (!configuredIds.has(roleId)) {
    await interaction.reply({ embeds: [makeEmbed("error", "Role Not Configured", "That reaction role is no longer configured.")], ephemeral: true });
    return;
  }

  const guild = interaction.guild!;
  const targetRole = guild.roles.cache.get(roleId);
  const member = await guild.members.fetch(interaction.user.id).catch(() => null);
  const me = await botMember(guild);
  if (!targetRole || targetRole.id === guild.id || targetRole.managed || !member || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    await interaction.reply({ embeds: [makeEmbed("error", "Role Unavailable", "I can't do that because I don't have the required permission: Manage Roles.")], ephemeral: true });
    return;
  }

  const configuredRoles = config.roles
    .map((entry) => guild.roles.cache.get(entry.roleId))
    .filter((role): role is NonNullable<typeof role> => Boolean(role));
  const unmanageable = configuredRoles.find((role) => role.managed || role.position >= me.roles.highest.position);
  if (unmanageable || targetRole.position >= me.roles.highest.position) {
    await interaction.reply({ embeds: [makeEmbed("error", "Role Hierarchy Blocked", `I can't manage ${unmanageable?.name ?? targetRole.name} because it is above or equal to Integral's highest role.`)], ephemeral: true });
    return;
  }

  const previousIds = getConfiguredRoleIdsToRemove(
    configuredRoles.map((role) => role.id),
    new Set(member.roles.cache.keys()),
    roleId,
  );
  const previous = configuredRoles.filter((role) => previousIds.includes(role.id));
  await interaction.deferReply({ ephemeral: true });
  try {
    if (previous.length) await member.roles.remove(previous);
    if (!member.roles.cache.has(roleId)) await member.roles.add(targetRole);
    await interaction.editReply({ embeds: [makeEmbed("success", "Colour Role Updated", `You now have **${targetRole.name}**. Any previous configured colour role was removed. `)] });
  } catch {
    await interaction.editReply({ embeds: [makeEmbed("error", "Role Update Failed", "Discord rejected the role update. Check Integral's Manage Roles permission and role hierarchy.")] });
  }
}

export async function handleReactionRoleInteraction(interaction: Interaction): Promise<boolean> {
  if (interaction.isButton() && interaction.customId.startsWith("rr:pick:")) {
    await handlePublishedButton(interaction);
    return true;
  }
  if (!("customId" in interaction) || typeof interaction.customId !== "string" || !interaction.customId.startsWith("rr:")) {
    return false;
  }

  const session = await getSession(interaction);
  if (!session) {
    if (interaction.isRepliable()) {
      await interaction.reply({ embeds: [makeEmbed("error", "Access Denied", "Only the configuring Administrator can use this setup panel.")], ephemeral: true });
    }
    return true;
  }

  if (interaction.isButton()) await handleSetupButton(interaction, session);
  else if (interaction.isModalSubmit()) await handleSetupModal(interaction, session);
  else if (interaction.isChannelSelectMenu() && interaction.customId === setupCustomId("channel-select")) {
    await publishReactionRoles(interaction, session);
  }
  return true;
}