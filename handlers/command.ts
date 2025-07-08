import { REST, Routes, SlashCommandBuilder } from "discord.js";
import { commands } from "../commands";
import { readdirSync } from "fs";

const rest = new REST({ version: "10" }).setToken(process.env.token!);

export async function deployCommands() {
    const commandsData = Object.values(commands).map((command) => command.data);

    try {
        console.log(`Started refreshing ${commandsData.length} application (/) commands.`);
        await rest.put(
            Routes.applicationGuildCommands(String(process.env.clientId!), process.env.GUILD_ID!),
            { body: commandsData },
        );
        console.log(`Successfully reloaded ${commandsData.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
}

export async function flushCommands() {
    try {
        console.log('Started deleting all application (/) commands.');
        await rest.put(Routes.applicationGuildCommands(String(process.env.clientId!), process.env.GUILD_ID!), { body: [] })
            .then(() => console.log('Successfully deleted all application commands.'))
            .catch(console.error);
    } catch (error) {
        console.error(error);
    }
}