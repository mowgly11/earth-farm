"use strict";

import mongoose from "mongoose";

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
        mongoose.connection.on('connected', () => console.log('Connected to Mongoose'));
        mongoose.connection.on('disconnected', () => console.log('Disconnected to Mongoose'));
        mongoose.connection.on('error', (error) => console.log('Connection Error: ' + error));
        
        await mongoose.connect(this.getConnectUrl());
    }
}

export default MongooseInit;