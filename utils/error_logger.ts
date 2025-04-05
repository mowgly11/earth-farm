import { Client, TextChannel, EmbedBuilder } from "discord.js";

const ERROR_CHANNEL_ID = "1358199129238405137";

interface ErrorData {
    path: string;
    error: unknown;
}

export async function logError(client: Client, data: ErrorData) {
    try {
        const channel = await client.channels.fetch(ERROR_CHANNEL_ID) as TextChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`:warning: New Error!`)
            .setColor("Red")
            .setDescription(`path: ${data.path}\nError: \n\`\`\`${data.error}\`\`\``)
            .setTimestamp();
            
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to log transaction:", error);
    }
}