import { Client, TextChannel, EmbedBuilder } from "discord.js";

const TRANSACTION_CHANNEL_ID = process.env.TRANSACTION_LOG_CHANNEL_ID!;

const SUSPICIOUS_THRESHOLDS = {
    GOLD_AMOUNT: 10000,     // 10k gold
    ITEM_QUANTITY: 30,        // 50+ items in a single transaction
    TRADE_TOTAL_ITEMS: 50,   // Combined total items in a trade
    TRADE_VALUE_DIFF: 5000  // Suspicious if trade values differ by more than 5k
};

interface TransactionData {
    type: "buy" | "sell" | "trade" | "harvest" | "daily" | "scratch";
    initiator: string;
    initiatorUsername: string;
    target?: string;
    targetUsername?: string;
    item?: string;  // Optional for daily/scratch
    quantity?: number;  // Optional for daily/scratch
    price?: number;
    isProduct?: boolean;  // Optional for daily/scratch
    initiatorGoldBefore: number;
    initiatorGoldAfter: number;
    targetGoldBefore?: number;
    targetGoldAfter?: number;
    // New fields for game actions
    xpBefore?: number;
    xpAfter?: number;
    cropsHarvested?: number;
    animalsCollected?: number;
    streakBonus?: number;
    scratchResult?: "win" | "lose";
}

export async function logTransaction(client: Client, data: TransactionData) {
    try {
        const channel = await client.channels.fetch(TRANSACTION_CHANNEL_ID) as TextChannel;
        if (!channel) return;

        const isSuspicious = isSuspiciousTransaction(data);

        // Choose emoji and color based on transaction type
        const typeConfig: Record<string, { emoji: string; color: number }> = {
            buy: { emoji: "🛒", color: 0x3498DB },
            sell: { emoji: "💵", color: 0x2ECC71 },
            trade: { emoji: "🔄", color: 0xF1C40F },
            harvest: { emoji: "🌾", color: 0x27AE60 },
            daily: { emoji: "📅", color: 0x9B59B6 },
            scratch: { emoji: "🎰", color: 0xE67E22 }
        };

        const config = typeConfig[data.type] || { emoji: "📝", color: 0x95A5A6 };

        const embed = new EmbedBuilder()
            .setTitle(`${isSuspicious ? "⚠️ " : config.emoji + " "}${data.type.toUpperCase()} Transaction`)
            .setColor(isSuspicious ? 0xFF0000 : config.color)
            .setTimestamp();

        let description = `**User:** ${data.initiatorUsername} (${data.initiator})\n`;

        // Handle different transaction types
        if (data.type === "buy" || data.type === "sell" || data.type === "trade") {
            if (data.target) description += `**Target:** ${data.targetUsername} (${data.target})\n`;
            if (data.item) description += `**Item:** ${data.item} (${data.isProduct ? "Product" : "Market Item"})\n`;
            if (data.quantity) description += `**Quantity:** ${data.quantity}\n`;
            if (data.price) description += `**Price:** ${data.price} 🪙\n\n`;
        } else if (data.type === "harvest") {
            if (data.cropsHarvested) description += `**Crops Harvested:** ${data.cropsHarvested}\n`;
            if (data.animalsCollected) description += `**Animals Collected:** ${data.animalsCollected}\n`;
        } else if (data.type === "daily") {
            const goldEarned = data.initiatorGoldAfter - data.initiatorGoldBefore;
            description += `**Gold Earned:** +${goldEarned} 🪙\n`;
            if (data.streakBonus) description += `**Streak Bonus:** +${data.streakBonus} 🪙\n`;
        } else if (data.type === "scratch") {
            const result = data.scratchResult === "win" ? "🎉 WIN" : "❌ LOSE";
            const goldChange = data.initiatorGoldAfter - data.initiatorGoldBefore;
            description += `**Result:** ${result}\n`;
            description += `**Gold Change:** ${goldChange >= 0 ? "+" : ""}${goldChange} 🪙\n`;
        }

        // Add gold balance changes
        description += `\n**Gold:** ${data.initiatorGoldBefore} → ${data.initiatorGoldAfter} 🪙`;
        if (data.targetGoldBefore && data.targetGoldAfter) {
            description += `\n**Target's Gold:** ${data.targetGoldBefore} → ${data.targetGoldAfter} 🪙`;
        }

        // Add XP changes if present
        if (data.xpBefore !== undefined && data.xpAfter !== undefined) {
            const xpGain = data.xpAfter - data.xpBefore;
            description += `\n**XP:** ${data.xpBefore} → ${data.xpAfter} (+${xpGain}) ⭐`;
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
    // Skip suspicious checks for non-trade actions
    if (data.type === "harvest" || data.type === "daily" || data.type === "scratch") {
        return false;
    }

    // Check for large gold changes
    const initiatorGoldChange = Math.abs(data.initiatorGoldAfter - data.initiatorGoldBefore);
    const targetGoldChange = data.targetGoldBefore && data.targetGoldAfter
        ? Math.abs(data.targetGoldAfter - data.targetGoldBefore)
        : 0;

    // For trades, check total items being exchanged
    if (data.type === "trade" && data.item) {
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
        (data.quantity !== undefined && data.quantity > SUSPICIOUS_THRESHOLDS.ITEM_QUANTITY) ||
        (data.price !== undefined && data.price > SUSPICIOUS_THRESHOLDS.GOLD_AMOUNT)
    );
}