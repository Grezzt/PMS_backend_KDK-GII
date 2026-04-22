"use strict";

const { MongoClient } = require("mongodb");

let client = null;
let db = null;

/**
 * MongoDB Connection Manager
 * Database: pms_nosql
 * Collections: user_tokens, audit_logs
 */

/**
 * Dapatkan koneksi MongoDB (singleton pattern)
 * @returns {Promise<import('mongodb').Db>}
 */
async function getMongoDb() {
  if (db) return db;

  const uri = process.env.MONGO_URI || "mongodb://pms_mongo:pms_mongo_pass@localhost:27017/pms_nosql?authSource=admin";

  client = new MongoClient(uri, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000
  });

  await client.connect();
  db = client.db("pms_nosql");

  console.log("✅ Connected to MongoDB (pms_nosql)");
  return db;
}

/**
 * Dapatkan collection dari MongoDB
 * @param {"user_tokens"|"audit_logs"} collectionName
 */
async function getCollection(collectionName) {
  const database = await getMongoDb();
  return database.collection(collectionName);
}

/**
 * Tutup koneksi MongoDB
 */
async function closeMongoDb() {
  if (client) {
    await client.close();
    client = null;
    db = null;
  }
}

module.exports = { getMongoDb, getCollection, closeMongoDb };
