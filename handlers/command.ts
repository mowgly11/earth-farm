import { REST, Routes } from "discord.js";

import { commands } from "../commands";

const commandsData = Object.values(commands).map((command) => command.data);

const rest = new REST({ version: "10" }).setToken(process.env.token!);

export async function deployCommands() {
  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(
      Routes.applicationCommands(String(process.env.clientId!)),
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
  rest.put(Routes.applicationGuildCommands(String(process.env.clientId!), "886987831141101649"), { body: [] })
    .then(() => console.log('Successfully deleted all application commands.'))
    .catch(console.error);
}