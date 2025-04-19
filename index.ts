import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { deployCommands, flushCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
import NodeCache from 'node-cache';

const userProfileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });
const cooldowns = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

export { userProfileCache };

const databaseConnection = new MongooseInit(process.env.mongo_connection!);
databaseConnection.connect();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], allowedMentions: { repliedUser: false } });

let currentStatus = ["/help", "", "build 0.0.4"];
let i = 0;
client.on(Events.ClientReady, async readyClient => {
  await deployCommands();
  //await flushCommands();

  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  client.user?.setStatus("idle");

  setInterval(() => {
    currentStatus[1] = `${client.guilds.cache.size} servers`;
    client.user?.setActivity(currentStatus[i], { type: ActivityType.Watching });
    i++;
    i = (i + 1) % currentStatus.length;
  }, 15000);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.user.bot) return interaction.reply({ content: "bots are not allowed to use me.", flags: MessageFlags.Ephemeral });

  if (cooldowns.has(interaction.user.id)) {
    const cooldown = Number(cooldowns.get(interaction.user.id));
    if (Date.now() < cooldown) {
      const timeLeft = Math.ceil((cooldown - Date.now()) / 1000);
      return interaction.reply({ content: `You need to wait **${timeLeft}** seconds before using this command again!`, flags: MessageFlags.Ephemeral });
    }
  }

  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) commands[commandName as keyof typeof commands].execute(interaction);

  cooldowns.set(interaction.user.id, Date.now() + 5000); // 5 seconds cooldown
});

client.on("messageCreate", (message) => {
  if (message.author.id != "632688963093528596") return;

  if (message.content.includes("wipe")) {
    userProfileCache.flushAll();
    return message.reply({ content: "done!" });
  }
})

client.login(process.env.token!);