import { Client, EmbedBuilder, TextChannel } from "discord.js";
const ERROR_CHANNEL_ID = process.env.ERROR_LOG_CHANNEL_ID!;

export default async function logError(client: Client, error: any, context?: string) {
    try {
        const errorChannel = await client.channels.fetch(ERROR_CHANNEL_ID) as TextChannel;
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 Error Occurred')
            .setDescription(`\`\`\`${error.message || error}\`\`\``)
            .setTimestamp();

        if (context) {
            errorEmbed.addFields({ name: 'Context', value: context });
        }

        if (error.stack) {
            errorEmbed.addFields({ 
                name: 'Stack Trace', 
                value: `\`\`\`${error.stack.substring(0, 1000)}\`\`\`` 
            });
        }

        await errorChannel.send({ embeds: [errorEmbed] });
    } catch (logError) {
        console.error('Failed to log error to Discord:', logError);
        console.error('Original error:', error);
    }
}