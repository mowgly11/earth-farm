import { REST, Routes } from "discord.js";
import { token, clientid } from "../config.json";
import { commands } from "../commands";

const commandsData = Object.values(commands).map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(token);

export async function deployCommands() {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationGuildCommands(clientid, "886987831141101649"),
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
  rest.put(Routes.applicationGuildCommands(clientid, "886987831141101649"), { body: [] })
    .then(() => console.log('Successfully deleted all application commands.'))
    .catch(console.error);
}