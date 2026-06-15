import { logger } from "../lib/logger.js";

let connected = false;

export async function connectDatabase(): Promise<void> {
  // TODO: Replace with real MongoDB connection
  // import mongoose from "mongoose";
  // const uri = process.env["MONGODB_URI"];
  // if (!uri) throw new Error("MONGODB_URI is required");
  // await mongoose.connect(uri);
  logger.info("Database: using in-memory store (MongoDB not configured yet)");
  connected = true;
}

export function isConnected(): boolean {
  return connected;
}
