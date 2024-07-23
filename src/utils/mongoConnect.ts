import { Db, MongoClient } from "mongodb";

let db: Db;

const dbName = process.env.DB_NAME!;

// Init uri
const uri = process.env.MONGODB_URI!;
console.log(uri);

export async function getDB(): Promise<Db> {
  if (!db) {
    try {
      // CONNECT TO THE DB
      const client = new MongoClient(uri);
      await client.connect();
      db = client.db(dbName);
      console.log('Connected to MongoDB!');

    } catch (error) {
      console.error('Error while connecting to MongoDB', error);
    }
  }
  return db;
}


