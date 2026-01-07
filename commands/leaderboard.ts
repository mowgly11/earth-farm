import { ChatInputCommandInteraction, SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, ComponentType, MessageFlags } from "discord.js";
import database from "../database/methods.ts";
import { Document } from "mongoose";
import { logError } from "../utils/error_logger.ts";
import { COLORS } from "../utils/constants.ts";
import { LEADERBOARD_BUTTONS, BUTTONS } from "../utils/buttons.ts";

export interface UserProfile {
    id: string;
    username: string;
    level: number;
    xp: number;
    gold: number;
}

export const USERS_PER_PAGE = 10;

export const data = new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("View the server's leaderboard")
    .addStringOption(option =>
        option
            .setName("type")
            .setDescription("What to rank players by")
            .setRequired(true)
            .addChoices(
                { name: "Experience Points (XP)", value: "xp" },
                { name: "Gold Balance", value: "gold" }
            )
    );

export async function execute(interaction: ChatInputCommandInteraction) {
    await interaction.deferReply();

    const type = interaction.options.getString("type")! as 'xp' | 'gold';
    let currentPage = 0;

    try {
        // Get paginated leaderboard data (fetches only USERS_PER_PAGE users)
        const { users: pageProfiles, total } = await database.getLeaderboard(type, currentPage, USERS_PER_PAGE);
        const totalPages = Math.ceil(total / USERS_PER_PAGE);

        // Get user's rank for display
        const userRank = await database.getUserRank(interaction.user.id, type);

        // If only 1 page, no need for pagination buttons
        if (totalPages <= 1) {
            const embed = createLeaderboardEmbedPaginated(pageProfiles, type, currentPage, totalPages, total, interaction.user.id, userRank);
            const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            return await interaction.editReply({ embeds: [embed], components: [navRow] });
        }

        // Create initial embed with buttons
        const embed = createLeaderboardEmbedPaginated(pageProfiles, type, currentPage, totalPages, total, interaction.user.id, userRank);
        const row = createPaginationButtons(currentPage, totalPages);

        const response = await interaction.editReply({ embeds: [embed], components: [row, new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard())] });

        // Create button collector
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 120000 // 2 minutes timeout
        });

        collector.on("collect", async (i) => {
            // Only the command user can navigate
            if (i.user.id !== interaction.user.id) {
                const validationEmbed = new EmbedBuilder()
                    .setTitle("🚫 Not Your Leaderboard")
                    .setColor(0xE74C3C)
                    .setDescription("This leaderboard belongs to someone else!\n\nWant your own? Use the button below.")
                    .setFooter({ text: "Tip: Use /leaderboard to create your own!" });
                const actionRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
                    BUTTONS.leaderboard().setLabel("Open My Leaderboard"),
                    BUTTONS.dashboard()
                );
                await i.reply({ embeds: [validationEmbed], components: [actionRow], flags: MessageFlags.Ephemeral });
                return;
            }

            // Update page based on button clicked
            if (i.customId === "lb_prev") {
                currentPage = Math.max(0, currentPage - 1);
            } else if (i.customId === "lb_next") {
                currentPage = Math.min(totalPages - 1, currentPage + 1);
            } else if (i.customId === "lb_first") {
                currentPage = 0;
            } else if (i.customId === "lb_last") {
                currentPage = totalPages - 1;
            }

            // Fetch the new page data
            const { users: newPageProfiles } = await database.getLeaderboard(type, currentPage, USERS_PER_PAGE);

            // Update embed and buttons
            const newEmbed = createLeaderboardEmbedPaginated(newPageProfiles, type, currentPage, totalPages, total, interaction.user.id, userRank);
            const newRow = createPaginationButtons(currentPage, totalPages);

            await i.update({ embeds: [newEmbed], components: [newRow, new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard())] });
        });

        collector.on("end", async () => {
            // Disable all buttons when collector ends
            const disabledRow = createPaginationButtons(currentPage, totalPages, true);
            const navRow = new ActionRowBuilder<ButtonBuilder>().addComponents(BUTTONS.dashboard());
            await interaction.editReply({ components: [disabledRow, navRow] }).catch(() => { });
        });

    } catch (error) {
        logError(interaction.client, {
            path: "leaderboard.ts",
            error
        });
        return await interaction.editReply({ content: "Failed to fetch leaderboard data. Please try again later." });
    }
}

export function createLeaderboardEmbed(
    profiles: UserProfile[],
    type: string,
    page: number,
    totalPages: number,
    userId: string
): EmbedBuilder {
    const startIndex = page * USERS_PER_PAGE;
    const pageProfiles = profiles.slice(startIndex, startIndex + USERS_PER_PAGE);

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Leaderboard - ${type.toUpperCase()}`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp()
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • ${profiles.length} total farmers` });

    // Build leaderboard description
    let description = "";
    for (let i = 0; i < pageProfiles.length; i++) {
        const profile = pageProfiles[i];
        const rank = startIndex + i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "👤";

        if (type === "xp") {
            description += `${medal} **${rank}.** ${profile.username} - Level ${profile.level} (${profile.xp} XP)\n`;
        } else {
            description += `${medal} **${rank}.** ${profile.username} - ${profile.gold} 🪙\n`;
        }
    }

    // Add user's rank if not visible on current page
    const userProfile = profiles.find((p: UserProfile) => p.id === userId);
    if (userProfile) {
        const userRank = profiles.findIndex((p: UserProfile) => p.id === userId) + 1;
        const userPageStart = page * USERS_PER_PAGE + 1;
        const userPageEnd = Math.min((page + 1) * USERS_PER_PAGE, profiles.length);

        if (userRank < userPageStart || userRank > userPageEnd) {
            description += "\n─────────────────────────\n";
            if (type === "xp") {
                description += `👤 **${userRank}.** You - Level ${userProfile.level} (${userProfile.xp} XP)\n`;
            } else {
                description += `👤 **${userRank}.** You - ${userProfile.gold} 🪙\n`;
            }
        }
    }

    if (!description) {
        description = "No users found on the leaderboard.";
    }

    embed.setDescription(description);
    return embed;
}

/**
 * Create leaderboard embed for paginated data (doesn't need full profiles array)
 */
export function createLeaderboardEmbedPaginated(
    pageProfiles: UserProfile[],
    type: string,
    page: number,
    totalPages: number,
    totalUsers: number,
    userId: string,
    userRank: number
): EmbedBuilder {
    const startIndex = page * USERS_PER_PAGE;

    const embed = new EmbedBuilder()
        .setTitle(`🏆 Leaderboard - ${type.toUpperCase()}`)
        .setColor(COLORS.PRIMARY)
        .setTimestamp()
        .setFooter({ text: `Page ${page + 1} of ${totalPages} • ${totalUsers} total farmers` });

    // Build leaderboard description
    let description = "";
    for (let i = 0; i < pageProfiles.length; i++) {
        const profile = pageProfiles[i];
        const rank = startIndex + i + 1;
        const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : "👤";
        const isCurrentUser = profile.id === userId;
        const highlight = isCurrentUser ? "→ " : "";

        if (type === "xp") {
            description += `${highlight}${medal} **${rank}.** ${profile.username} - Level ${profile.level} (${profile.xp} XP)\n`;
        } else {
            description += `${highlight}${medal} **${rank}.** ${profile.username} - ${profile.gold} 🪙\n`;
        }
    }

    // Add user's rank if not visible on current page
    const userPageStart = startIndex + 1;
    const userPageEnd = startIndex + pageProfiles.length;

    if (userRank > 0 && (userRank < userPageStart || userRank > userPageEnd)) {
        description += "\n─────────────────────────\n";
        description += `👤 **${userRank}.** Your position\n`;
    }

    if (!description) {
        description = "No users found on the leaderboard.";
    }

    embed.setDescription(description);
    return embed;
}

export function createPaginationButtons(currentPage: number, totalPages: number, disabled = false): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        LEADERBOARD_BUTTONS.first(disabled || currentPage === 0),
        LEADERBOARD_BUTTONS.prev(disabled || currentPage === 0),
        LEADERBOARD_BUTTONS.pageInfo(currentPage, totalPages),
        LEADERBOARD_BUTTONS.next(disabled || currentPage === totalPages - 1),
        LEADERBOARD_BUTTONS.last(disabled || currentPage === totalPages - 1)
    );
}
