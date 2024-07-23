import { CacheData } from "../models/models.ts";
import * as fs from 'fs/promises';
import * as path from 'path';

const cacheStore: { [key: string]: CacheData } = {};
// const cacheFilepath = path.resolve('cache.json');

// load cache from file
export async function loadCache(): Promise<void> {
    try {
        const data = await fs.readFile('./cache.json', 'utf-8');
        const parsedData = JSON.parse(data); // makes it json object
        Object.assign(cacheStore, parsedData);
    } catch (error) {
        console.error('Error while loading cache', error);
    }
}

// save cache to file
export async function saveCache(): Promise<void> {
    try {
        await fs.writeFile('./cache.json', JSON.stringify(cacheStore, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error while saving cache', error);
    }
}

export function cacheGet(key: string): any | null {
    const cacheData = cacheStore[key];

    if (!cacheData) {
        return null;
    }

    const now = new Date().getTime();
    if (now > cacheData.expiration) {
        delete cacheStore[key];
        return null;
    }

    return cacheData.data;
}

export function cacheSet(key: string, data: any, ttl: number = 1000 * 60 * 10): any { // default ttl is 10 minutes

    const expiration = new Date().getTime() + ttl;
    cacheStore[key] = { data, expiration };
    saveCache(); // save cache to file

    return { data, expiration };
}
