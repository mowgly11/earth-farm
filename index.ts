import { ActivityType, Client, Events, GatewayIntentBits } from 'discord.js';
import { token, mongo_connection } from './config.json';
import { deployCommands, flushCommands } from './handlers/command.ts';
import { commands } from './commands';
import MongooseInit from "./database/connect.ts";
 
const databaseConnection = new MongooseInit(mongo_connection);
databaseConnection.connect();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
 
client.once(Events.ClientReady, async readyClient => {
  await deployCommands();

	console.log(`Ready! Logged in as ${readyClient.user.tag}`);
  client.user?.setActivity("Under Maintenance", { type: ActivityType.Playing });
  client.user?.setStatus("idle");
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;
  
  const { commandName } = interaction;
  if (commands[commandName as keyof typeof commands]) commands[commandName as keyof typeof commands].execute(interaction);
});

client.login(token);