import { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";

import type { Command } from "../types.js";
import type { UserStats } from "../db/models/GuildMember.js";

import {
  getTopByMessages,
  getTopByVoice,
  getTopByWeeklyMessages,
  getTopByWeeklyVoice,
  getTopByXp,
} from "../db/models/GuildMember.js";

import { levelFromXp } from "../config.js";


const PAGE_SIZE = 10;
const MAX_PAGES = 10;


type Category =
  | "levels"
  | "messages"
  | "voice"
  | "weekly-messages"
  | "weekly-voice";


const CATEGORY_LABELS: Record<Category, string> = {
  levels: "Levels (All Time)",
  messages: "All Time Messages",
  voice: "All Time Voice",
  "weekly-messages": "Weekly Messages",
  "weekly-voice": "Weekly Voice",
};


async function fetchPage(
  guildId: string,
  category: Category,
  page: number,
): Promise<UserStats[]> {

  const offset = page * PAGE_SIZE;

  switch (category) {

    case "levels":
      return getTopByXp(guildId, PAGE_SIZE, offset);

    case "messages":
      return getTopByMessages(guildId, PAGE_SIZE, offset);

    case "voice":
      return getTopByVoice(guildId, PAGE_SIZE, offset);

    case "weekly-messages":
      return getTopByWeeklyMessages(guildId, PAGE_SIZE, offset);

    case "weekly-voice":
      return getTopByWeeklyVoice(guildId, PAGE_SIZE, offset);
  }
}


function formatVoice(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes));

  const h = Math.floor(m / 60);
  const rem = m % 60;

  if (h > 0) {
    if (rem > 0) {
      return `${h} hour${h !== 1 ? "s" : ""} ${rem} minute${rem !== 1 ? "s" : ""}`;
    }

    return `${h} hour${h !== 1 ? "s" : ""}`;
  }

  return `${rem} minute${rem !== 1 ? "s" : ""}`;
}


function formatRow(stats: UserStats, rank: number, category: Category): string {
  const mention = `<@${stats.userId}>`;

  switch (category) {
    case "levels":
  return `${rank}. ${mention} — Level ${levelFromXp(stats.xp)} • ${stats.xp.toLocaleString()} XP`;

    case "messages":
      return `${rank}. ${mention} — ${(stats.messages ?? 0).toLocaleString()} messages`;

    case "voice":
      return `${rank}. ${mention} — ${
        (stats.voiceMinutes ?? 0) === 0
          ? "0 minute"
          : formatVoice(stats.voiceMinutes ?? 0)
      }`;

    case "weekly-messages":
      return `${rank}. ${mention} — ${(stats.weeklyMessages ?? 0).toLocaleString()} messages`;

    case "weekly-voice":
      return `${rank}. ${mention} — ${
        (stats.weeklyVoiceMinutes ?? 0) === 0
          ? "0 minute"
          : formatVoice(stats.weeklyVoiceMinutes ?? 0)
      }`;
  }
}



function buildButtons(
  page:number,
  hasMore:boolean,
):ActionRowBuilder<ButtonBuilder> {

  return new ActionRowBuilder<ButtonBuilder>()
    .addComponents(

      new ButtonBuilder()
        .setCustomId("lb_prev")
        .setLabel("◀ Prev")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),


      new ButtonBuilder()
        .setCustomId("lb_next")
        .setLabel("Next ▶")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!hasMore),

    );
}



export const leaderboard:Command = {


data:new SlashCommandBuilder()

.setName("leaderboard")

.setDescription("View leaderboard")

.addStringOption(opt =>
  opt
    .setName("category")
    .setDescription("Leaderboard category")
    .setRequired(true)

    .addChoices(

      {
        name:"Levels",
        value:"levels"
      },

      {
        name:"Messages",
        value:"messages"
      },

      {
        name:"Voice",
        value:"voice"
      },

      {
        name:"Weekly Messages",
        value:"weekly-messages"
      },

      {
        name:"Weekly Voice",
        value:"weekly-voice"
      },

    )
),



async execute(
interaction:ChatInputCommandInteraction
):Promise<void>{


await interaction.deferReply();



const guildId = interaction.guildId!;


const category =
interaction.options.getString("category") as Category;



if(!category){

  await interaction.editReply({
    embeds: [
      {
        title: "❌ Missing Category",
        description:
          "Please provide a leaderboard category.\n\n**Available Categories**\n• Levels\n• Messages\n• Voice\n• Weekly Messages\n• Weekly Voice",
        color: 0xff4444,
      },
    ],
  });

 return;

}



let page = 0;



async function render(p:number){


const users = await fetchPage(
 guildId,
 category,
 p
);



const startRank = p * PAGE_SIZE + 1;


const hasMore =
users.length === PAGE_SIZE &&
p + 1 < MAX_PAGES;



  const rows = (
    await Promise.all(
      users.map(async (u, i) => {
        const member = await interaction.guild?.members
          .fetch(u.userId)
          .catch(() => null);

        if (!member) return null;

        return formatRow(u, startRank + i, category);
      }),
    )
  ).filter(Boolean);



return {

content:

`## 📅 π ${CATEGORY_LABELS[category]}
----------------------------
${rows.join("\n")}


*Page ${p+1} of 10*`,

components:[
buildButtons(
p,
hasMore
)
]

};

}



const reply =
await interaction.editReply(
await render(page)
);



const collector =
reply.createMessageComponentCollector({

componentType:ComponentType.Button,

filter:(i)=>
i.user.id === interaction.user.id,

time:120000

});



collector.on(
"collect",
async(btn)=>{


if(btn.customId==="lb_prev" && page>0)
page--;


else if(btn.customId==="lb_next")
page++;


await btn.update(
await render(page)
);


});



collector.on(
"end",
async()=>{

try{

const final =
await render(page);


for(const row of final.components){

for(const button of row.components){

(button as ButtonBuilder)
.setDisabled(true);

}

}


await interaction.editReply(final);


}catch{}

});

}

};
