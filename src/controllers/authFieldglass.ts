import puppeteer from "puppeteer";
import { FieldglassCredentials, FieldglassAuthentication } from "src/models/models.ts";
import { cacheGet, cacheSet } from "../utils/cache.ts";
import * as Sentry from '@sentry/node';
import { createHash } from "crypto";
import * as fs from 'fs/promises';

function generateHashKey(credential: FieldglassCredentials): string {
    const hash = createHash('sha256');
    hash.update(`${credential.rootUrl}:${credential.userName}:${credential.password}`);
    return hash.digest('hex'); // Finalize the hash computation and get the result as a hexadecimal string
}

export async function getFieldglassAuthentication(credentials: FieldglassCredentials): Promise<FieldglassAuthentication> {
    const uniqueCacheKey = generateHashKey(credentials);
    const cachedAuthData = cacheGet(uniqueCacheKey);
    // check if the token is already in the cache
    if (cachedAuthData) {
        return cachedAuthData;
    }
    // If no cached data, perform the authentication process using Puppeteer
    const { rootUrl, userName, password } = credentials;
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    try {
        await page.goto(rootUrl, { waitUntil: 'load' });
        const cookieStatement = await page.$("#truste-consent-track");
        if (cookieStatement) {
            await page.click("#truste-consent-button");
        }
        await new Promise((resolve) => setTimeout(resolve, 5000));
        // Login
        await page.type('#usernameId_new', userName);
        await page.type('#passwordId_new', password);
        // Check if the cookie statement is present
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        const authToken = await page.cookies();

        if (!authToken) {
            Sentry.captureException(new Error("Authentication failed"));
            throw new Error("Authentication failed");
        }
        const ttl = 5 * 60 * 1000;
        const now = new Date().getTime();
        const expiration = now + ttl;

        // cache the authentication data
        cacheSet(uniqueCacheKey, { authToken, expiration }, ttl);

        return { authToken, expiration };

    } catch (error) {
        Sentry.captureException(error);
        throw new Error("Error while getting the authentication token");
    } finally {
        await browser.close();
    }

}