// import puppeteer from "puppeteer-extra"
// import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import puppeteer from "puppeteer";
import { FieldglassCredentials, FieldglassAuthentication } from "src/models/models.ts";
import { cacheGet, cacheSet } from "../utils/cache.ts";
import * as Sentry from '@sentry/node';
import { sleep } from "../utils/utilFunctions.ts";


export async function getFieldglassAuthentication(credentials: FieldglassCredentials): Promise<FieldglassAuthentication> {
    const cachedAuthData = cacheGet(credentials);
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

        await sleep(3);
        // Login
        await page.type('#usernameId_new', userName);
        await sleep(1);
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
        cacheSet(credentials, { authToken, expiration }, ttl);

        return { authToken, expiration };

    } catch (error) {
        Sentry.captureException(error);
        throw new Error("Error while getting the authentication token");
    } finally {
        await browser.close();
    }

}