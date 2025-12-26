"use strict";

import mongoose from "mongoose";
import { logger } from "../utils/logger.ts";

class MongooseInit {
    constructor(private connectionUrl: string) {
        this.connectionUrl = connectionUrl;
    }

    getConnectUrl(): string {
        return this.connectionUrl;
    }

    setConnectUrl(value: string): void {
        this.connectionUrl = value;
    }

    async connect() {
        mongoose.connection.on('connected', () => logger.success('Connected to MongoDB'));
        mongoose.connection.on('disconnected', () => logger.warn('Disconnected from MongoDB'));
        mongoose.connection.on('error', (error) => this.handleConnectionError(error));

        try {
            await mongoose.connect(this.getConnectUrl());
        } catch (error) {
            this.handleConnectionError(error);
            throw error; // Re-throw to prevent bot from running without DB
        }
    }

    private handleConnectionError(error: any) {
        const errorMessage = error?.message || String(error);

        // Check for common MongoDB Atlas issues
        if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
            logger.error('DNS Error - Cannot resolve MongoDB host', error, { hint: 'Check your MONGO_URI' });
        } else if (errorMessage.includes('MongoNetworkError') || errorMessage.includes('connect ETIMEDOUT')) {
            logger.error('Network Error - Cannot reach MongoDB server', error);
            console.log('');
            console.log('\x1b[33m╔══════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[33m║  ⚠️  MongoDB Atlas IP Whitelist Issue                    ║\x1b[0m');
            console.log('\x1b[33m╠══════════════════════════════════════════════════════════╣\x1b[0m');
            console.log('\x1b[33m║  Your current IP address is not whitelisted!              ║\x1b[0m');
            console.log('\x1b[33m║                                                          ║\x1b[0m');
            console.log('\x1b[33m║  Fix: Go to MongoDB Atlas → Network Access →             ║\x1b[0m');
            console.log('\x1b[33m║       Click "Add Current IP Address"                     ║\x1b[0m');
            console.log('\x1b[33m║                                                          ║\x1b[0m');
            console.log('\x1b[33m║  Or add 0.0.0.0/0 to allow all IPs (dev only!)           ║\x1b[0m');
            console.log('\x1b[33m╚══════════════════════════════════════════════════════════╝\x1b[0m');
            console.log('');
        } else if (errorMessage.includes('authentication failed') || errorMessage.includes('AuthenticationFailed')) {
            logger.error('Auth Error - Invalid MongoDB credentials', error);
            console.log('\x1b[31m→ Check username/password in MONGO_URI\x1b[0m');
        } else if (errorMessage.includes('MongoServerSelectionError')) {
            logger.error('Server Selection Error - Cannot connect to MongoDB cluster', error);
            console.log('');
            console.log('\x1b[33m╔══════════════════════════════════════════════════════════╗\x1b[0m');
            console.log('\x1b[33m║  ⚠️  Possible causes:                                    ║\x1b[0m');
            console.log('\x1b[33m║  1. IP not whitelisted in MongoDB Atlas                  ║\x1b[0m');
            console.log('\x1b[33m║  2. Wrong cluster name in connection string              ║\x1b[0m');
            console.log('\x1b[33m║  3. Network/firewall blocking connection                 ║\x1b[0m');
            console.log('\x1b[33m╚══════════════════════════════════════════════════════════╝\x1b[0m');
            console.log('');
        } else {
            logger.error('MongoDB Connection Error', error);
        }
    }
}

export default MongooseInit;