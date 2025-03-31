import { Client, TextChannel, EmbedBuilder } from "discord.js";

const TRANSACTION_CHANNEL_ID = "1356235686490931260";

const SUSPICIOUS_THRESHOLDS = {
    GOLD_AMOUNT: 10000,     // 10k gold
    ITEM_QUANTITY: 30,        // 50+ items in a single transaction
    TRADE_TOTAL_ITEMS: 50,   // Combined total items in a trade
    TRADE_VALUE_DIFF: 5000  // Suspicious if trade values differ by more than 5k
};

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

        const isSuspicious = isSuspiciousTransaction(data);

        const embed = new EmbedBuilder()
            .setTitle(`${isSuspicious ? "⚠️ " : "🔄 "}${data.type.toUpperCase()} Transaction`)
            .setColor(isSuspicious ? "#FF0000" : data.type === "buy" ? "Blue" : data.type === "sell" ? "Green" : "Yellow")
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

        if (isSuspicious) {
            description += "\n\n⚠️ **SUSPICIOUS TRANSACTION DETECTED** ⚠️";
        }

        embed.setDescription(description);
        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error("Failed to log transaction:", error);
    }
}

function isSuspiciousTransaction(data: TransactionData): boolean {
    // Check for large gold changes
    const initiatorGoldChange = Math.abs(data.initiatorGoldAfter - data.initiatorGoldBefore);
    const targetGoldChange = data.targetGoldBefore && data.targetGoldAfter 
        ? Math.abs(data.targetGoldAfter - data.targetGoldBefore)
        : 0;

    // For trades, check total items being exchanged
    if (data.type === "trade") {
        // Extract quantities from trade item string (format: "5x Item1 for 3x Item2")
        const quantities = data.item.match(/\d+x/g)?.map(x => parseInt(x)) || [];
        const totalItemsTraded = quantities.reduce((sum, qty) => sum + qty, 0);
        
        if (totalItemsTraded > SUSPICIOUS_THRESHOLDS.TRADE_TOTAL_ITEMS) {
            return true;
        }

        // Check for potentially unfair trades (if price data is available)
        if (data.price && data.targetGoldBefore && data.targetGoldAfter) {
            const tradeDifference = Math.abs(initiatorGoldChange - targetGoldChange);
            if (tradeDifference > SUSPICIOUS_THRESHOLDS.TRADE_VALUE_DIFF) {
                return true;
            }
        }
    }

    // Check other suspicious conditions
    return (
        initiatorGoldChange > SUSPICIOUS_THRESHOLDS.GOLD_AMOUNT ||
        targetGoldChange > SUSPICIOUS_THRESHOLDS.GOLD_AMOUNT ||
        data.quantity > SUSPICIOUS_THRESHOLDS.ITEM_QUANTITY ||
        (data.price !== undefined && data.price > SUSPICIOUS_THRESHOLDS.GOLD_AMOUNT)
    );
} 