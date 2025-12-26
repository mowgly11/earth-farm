/**
 * Professional Logger for Earth Farm Bot
 * Provides colorful, structured console logging with log levels
 */

import { BOT_VERSION } from "./constants.ts";

// ANSI color codes for terminal output
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',

    // Foreground colors
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',

    // Background colors
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
};

// Log level configuration
type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'cmd';

interface LogConfig {
    emoji: string;
    color: string;
    label: string;
}

const LOG_LEVELS: Record<LogLevel, LogConfig> = {
    debug: { emoji: '🔍', color: COLORS.gray, label: 'DEBUG' },
    info: { emoji: '📢', color: COLORS.cyan, label: 'INFO ' },
    warn: { emoji: '⚠️ ', color: COLORS.yellow, label: 'WARN ' },
    error: { emoji: '❌', color: COLORS.red, label: 'ERROR' },
    cmd: { emoji: '⚡', color: COLORS.magenta, label: 'CMD  ' },
};

/**
 * Format timestamp in a readable format
 */
function getTimestamp(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const mins = now.getMinutes().toString().padStart(2, '0');
    const secs = now.getSeconds().toString().padStart(2, '0');
    return `${COLORS.gray}${hours}:${mins}:${secs}${COLORS.reset}`;
}

/**
 * Format log message with level, timestamp, and content
 */
function formatMessage(level: LogLevel, message: string, meta?: Record<string, any>): string {
    const config = LOG_LEVELS[level];
    const timestamp = getTimestamp();
    const label = `${config.color}${COLORS.bright}${config.label}${COLORS.reset}`;

    let output = `${config.emoji} ${timestamp} ${label} ${COLORS.white}${message}${COLORS.reset}`;

    if (meta && Object.keys(meta).length > 0) {
        const metaStr = Object.entries(meta)
            .map(([k, v]) => `${COLORS.gray}${k}=${COLORS.reset}${v}`)
            .join(' ');
        output += ` ${metaStr}`;
    }

    return output;
}

/**
 * Main logger object with methods for each log level
 */
export const logger = {
    /**
     * Debug logging - for development details
     */
    debug(message: string, meta?: Record<string, any>) {
        if (process.env.LOG_LEVEL === 'debug') {
            console.log(formatMessage('debug', message, meta));
        }
    },

    /**
     * Info logging - general information
     */
    info(message: string, meta?: Record<string, any>) {
        console.log(formatMessage('info', message, meta));
    },

    /**
     * Warning logging - potential issues
     */
    warn(message: string, meta?: Record<string, any>) {
        console.warn(formatMessage('warn', message, meta));
    },

    /**
     * Error logging - errors with optional stack trace
     */
    error(message: string, error?: Error | any, meta?: Record<string, any>) {
        console.error(formatMessage('error', message, meta));

        if (error) {
            // Handle Error objects
            if (error instanceof Error) {
                console.error(`${COLORS.dim}  → ${error.name}: ${error.message}${COLORS.reset}`);
                if (error.stack) {
                    const stackLines = error.stack.split('\n').slice(1, 4).map(l => l.trim()).join('\n    ');
                    console.error(`${COLORS.dim}    ${stackLines}${COLORS.reset}`);
                }
            }
            // Handle objects (Discord API errors, etc)
            else if (typeof error === 'object') {
                try {
                    // Discord API error format
                    if (error.code && error.message) {
                        console.error(`${COLORS.dim}  → [${error.code}] ${error.message}${COLORS.reset}`);
                    } else {
                        const errorStr = JSON.stringify(error, null, 2).substring(0, 500);
                        console.error(`${COLORS.dim}  → ${errorStr}${COLORS.reset}`);
                    }
                } catch {
                    console.error(`${COLORS.dim}  → [Object with keys: ${Object.keys(error).join(', ')}]${COLORS.reset}`);
                }
            }
            // Handle strings/primitives
            else {
                console.error(`${COLORS.dim}  → ${String(error)}${COLORS.reset}`);
            }
        }
    },

    /**
     * Command logging - for tracking command usage
     */
    cmd(commandName: string, userId: string, guildName?: string) {
        const meta: Record<string, any> = { user: userId };
        if (guildName) meta.guild = guildName;
        console.log(formatMessage('cmd', `/${commandName}`, meta));
    },

    /**
     * Bot startup banner
     */
    banner() {
        const title = `🌾 Earth Farm Bot v${BOT_VERSION}`;
        const padding = Math.max(0, 31 - title.length);
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        console.log('');
        console.log(`${COLORS.green}${COLORS.bright}┌─────────────────────────────────┐${COLORS.reset}`);
        console.log(`${COLORS.green}${COLORS.bright}│${' '.repeat(leftPad)}${title}${' '.repeat(rightPad)}│${COLORS.reset}`);
        console.log(`${COLORS.green}${COLORS.bright}└─────────────────────────────────┘${COLORS.reset}`);
        console.log('');
    },

    /**
     * Ready message when bot is online
     */
    ready(botTag: string, guildCount: number) {
        console.log('');
        console.log(`${COLORS.green}${COLORS.bright}✅ Bot is online!${COLORS.reset}`);
        console.log(`${COLORS.cyan}   Tag: ${COLORS.white}${botTag}${COLORS.reset}`);
        console.log(`${COLORS.cyan}   Guilds: ${COLORS.white}${guildCount}${COLORS.reset}`);
        console.log(`${COLORS.cyan}   Time: ${COLORS.white}${new Date().toLocaleString()}${COLORS.reset}`);
        console.log('');
    },

    /**
     * Section divider
     */
    divider(title?: string) {
        if (title) {
            console.log(`${COLORS.gray}─── ${title} ${'─'.repeat(Math.max(0, 30 - title.length))}${COLORS.reset}`);
        } else {
            console.log(`${COLORS.gray}${'─'.repeat(40)}${COLORS.reset}`);
        }
    },

    /**
     * Success message
     */
    success(message: string) {
        console.log(`${COLORS.green}✓${COLORS.reset} ${message}`);
    },

    /**
     * Loading/progress indicator
     */
    loading(message: string) {
        console.log(`${COLORS.cyan}⏳${COLORS.reset} ${message}...`);
    }
};

// Export individual functions for convenience
export const { debug, info, warn, error, cmd, banner, ready, divider, success, loading } = logger;
