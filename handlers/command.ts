import { REST, Routes } from "discord.js";
import { token, clientid } from "../config.json";
import { commands } from "../commands";

const commandsData = Object.values(commands).map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(token);

export async function deployCommands() {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationCommands(clientid),
      {
        body: commandsData,
      }
    );

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error(error);
  }
}

export async function flushCommands() {
  rest.put(Routes.applicationCommands(clientid), { body: [] })
    .then(() => console.log('Successfully deleted all application commands.'))
    .catch(console.error);
}