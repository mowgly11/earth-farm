import { Client, TextChannel, EmbedBuilder } from "discord.js";

const TRANSACTION_CHANNEL_ID = "1356235686490931260";

interface TransactionData {
    type: "buy" | "sell" | "trade";
    initiator: string;
    initiatorUsername: string;
    target?: string;
    targetUsername?: string;
    item: string;
    quantity: number;
    price?: number;
    isProduct: boolean;
    initiatorGoldBefore: number;
    initiatorGoldAfter: number;
    targetGoldBefore?: number;
    targetGoldAfter?: number;
}

export async function logTransaction(client: Client, data: TransactionData) {
    try {
        const channel = await client.channels.fetch(TRANSACTION_CHANNEL_ID) as TextChannel;
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(`🔄 ${data.type.toUpperCase()} Transaction`)
            .setColor(data.type === "buy" ? "Blue" : data.type === "sell" ? "Green" : "Yellow")
            .setTimestamp();

        let description = `**Initiator:** ${data.initiatorUsername} (${data.initiator})\n`;
        if (data.target) description += `**Target:** ${data.targetUsername} (${data.target})\n`;
        description += `**Item:** ${data.item} (${data.isProduct ? "Product" : "Market Item"})\n`;
        description += `**Quantity:** ${data.quantity}\n`;
        if (data.price) description += `**Price:** ${data.price} 🪙\n\n`;
        
        // Add gold balance changes
        description += `**Initiator's Gold:** ${data.initiatorGoldBefore} → ${data.initiatorGoldAfter} 🪙`;
        if (data.targetGoldBefore && data.targetGoldAfter) {
            description += `\n**Target's Gold:** ${data.targetGoldBefore} → ${data.targetGoldAfter} 🪙`;
        }

        embed.setDescription(description);
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to log transaction:", error);
    }
} 