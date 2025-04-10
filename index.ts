import { ActivityType, Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import { deployCommands, flushCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
import NodeCache from 'node-cache';

const userProfileCache = new NodeCache({ stdTTL: 3600, checkperiod: 120 });

export { userProfileCache };

const databaseConnection = new MongooseInit(process.env.mongo_connection!);
databaseConnection.connect();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages], allowedMentions: { repliedUser: false } });

client.once(Events.ClientReady, async readyClient => {
  await deployCommands();
  //await flushCommands();

  console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  client.user?.setActivity("/help", { type: ActivityType.Watching });
  client.user?.setStatus("idle");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  if (interaction.user.bot) return interaction.reply({ content: "bots are not allowed to use me.", flags: MessageFlags.Ephemeral });

  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) commands[commandName as keyof typeof commands].execute(interaction);
});

client.on("messageCreate", (message) => {
  if (message.author.id != "632688963093528596") return;

  if (message.content.includes("wipe")) {
    userProfileCache.flushAll();
    return message.reply({ content: "done!" });
  }
})

client.login(process.env.token!);