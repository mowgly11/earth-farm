import { Client, EmbedBuilder, TextChannel } from "discord.js";
import { logger } from "./logger.ts";

const ERROR_CHANNEL_ID = process.env.ERROR_LOG_CHANNEL_ID!;

/**
 * Safely extract error information from any error type
 */
function formatError(error: any): { message: string; stack?: string; details?: string } {
    // Handle null/undefined
    if (!error) {
        return { message: "Unknown error (null/undefined)" };
    }

    // Handle Error objects
    if (error instanceof Error) {
        return {
            message: error.message || error.name || "Error",
            stack: error.stack,
            details: error.cause ? JSON.stringify(error.cause, null, 2) : undefined
        };
    }

    // Handle strings
    if (typeof error === "string") {
        return { message: error };
    }

    // Handle objects with message property
    if (typeof error === "object") {
        // Discord API errors
        if (error.code && error.message) {
            return {
                message: `[${error.code}] ${error.message}`,
                details: error.rawError ? JSON.stringify(error.rawError, null, 2) : undefined
            };
        }

        // MongoDB errors
        if (error.name && error.message) {
            return {
                message: `[${error.name}] ${error.message}`,
                stack: error.stack
            };
        }

        // Generic object - stringify it
        try {
            return {
                message: JSON.stringify(error, null, 2).substring(0, 500)
            };
        } catch {
            return { message: `Object: ${Object.keys(error).join(", ")}` };
        }
    }

    // Fallback for primitives
    return { message: String(error) };
}

/**
 * Log error to Discord channel with rich formatting
 */
export async function logError(client: Client, error: any, context?: string) {
    const formatted = formatError(error);

    // Also log to console with our logger
    logger.error(formatted.message, error, context ? { context } : undefined);

    try {
        const errorChannel = await client.channels.fetch(ERROR_CHANNEL_ID) as TextChannel;

        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 Error Occurred')
            .setDescription(`\`\`\`\n${formatted.message.substring(0, 1900)}\n\`\`\``)
            .setTimestamp();

        // Add context
        if (context) {
            errorEmbed.addFields({ name: '📍 Context', value: `\`${context}\``, inline: true });
        }

        // Add error details (Discord API errors, etc)
        if (formatted.details) {
            errorEmbed.addFields({
                name: '📋 Details',
                value: `\`\`\`json\n${formatted.details.substring(0, 900)}\n\`\`\``
            });
        }

        // Add stack trace (truncated)
        if (formatted.stack) {
            // Extract just the first few lines of stack
            const stackLines = formatted.stack.split('\n').slice(0, 5).join('\n');
            errorEmbed.addFields({
                name: '📚 Stack Trace',
                value: `\`\`\`\n${stackLines.substring(0, 900)}\n\`\`\``
            });
        }

        // Add footer with timestamp
        errorEmbed.setFooter({ text: 'Error Logger' });

        await errorChannel.send({ embeds: [errorEmbed] });
    } catch (logError) {
        // Fallback to console if Discord logging fails
        logger.error('Failed to log error to Discord', logError);
        logger.error('Original error was:', error);
    }
}

/**
 * Quick error log without Discord (for non-critical errors)
 */
export function logErrorConsole(message: string, error?: any, meta?: Record<string, any>) {
    logger.error(message, error, meta);
}