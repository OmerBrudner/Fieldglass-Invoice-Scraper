import puppeteer from "puppeteer";
import { FieldglassAuthentication, MontoInvoice, FieldglassCredentials } from "src/models/models.ts";
import { getFieldglassInvoiceDetails, mapFieldglassToMontoInvoice } from "./invoiceServices.ts";
import { sleep } from "../utils/utilFunctions.ts";
import fetch from "node-fetch";
import { cacheSet } from "../utils/cache.ts";

/**
 * using Puppeteer to fetch and parse HTML, and Cheerio to process it
 * @param authentication 
 * @param fromDate 
 * @param toDate 
 * @returns invoices of type MontoInvoice[]
 */
export async function getFieldglassInvoices(
    credentials: FieldglassCredentials, authentication: FieldglassAuthentication, fromDate: string, toDate: string):
    Promise<MontoInvoice[]> {

    let invoices: MontoInvoice[] = [];
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Set the authentication token in headers
    await page.setCookie(...authentication.authToken)

    // Navigate to the invoices page
    await page.goto(process.env.FG_INVOICES_URL!, {
        waitUntil: "networkidle2"
    });

    // Input the date range for filtering invoices
    await page.waitForSelector('input[name="filterStartDate"]').then(async (el) => {
        await el!.click({ clickCount: 3 });
        await el!.type(fromDate.replace(/-/g, '/'));
    });

    await page.waitForSelector('input[name="filterEndDate"]').then(async (el) => {
        await el!.click({ clickCount: 3 });
        await el!.type(toDate.replace(/-/g, '/'));
    });

    await Promise.all([
        page.click('.ttFilterButton')
    ]);

    // sleep function to wait for the page to load
    await sleep(3);

    // Select the dropdown list to show all invoices
    const dropdown_list = await page.waitForSelector('#dropdownlistWrappergridpagerlistpast_invoice_supplier_list', { visible: true });
    await dropdown_list!.click();
    await page.waitForSelector('#listitem7innerListBoxgridpagerlistpast_invoice_supplier_list > span', { visible: true });
    await sleep(1);
    await page.click('#listitem7innerListBoxgridpagerlistpast_invoice_supplier_list > span');
    await sleep(1);

    await page.waitForSelector('.jqxGridParent.fd-table');

    // Get the new cookies after the page is loaded and update the auth token in the cache
    const ttl = 5 * 60 * 1000;
    const now = new Date().getTime();
    const expiration = now + ttl;
    const authToken = await page.cookies();
    cacheSet(credentials, { authToken, expiration }, ttl);

    // Extract invoice links from the table
    const invoicesLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.jqxGridParent.fd-table .archiveLink'));
        return links.map(link => (link as HTMLAnchorElement).href);
    });
    console.log('invoiceLinks', invoicesLinks);

    // getting an array of cookies objects and transforming it into a single object of cookies as key-value pairs
    const newCookies = await page.cookies();
    const cookiesObj: { [key: string]: string } = newCookies.reduce((acc: { [key: string]: string }, cookie) => {
        acc[cookie.name] = cookie.value;
        return acc;
    }, {});

    for (const link of invoicesLinks) {
        // check if the link is valid
        const response = await fetch(link, {
            "headers": {
                "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
                "accept-language": "en-US,en;q=0.9",
                "sec-ch-ua": "\"Google Chrome\";v=\"125\", \"Chromium\";v=\"125\", \"Not.A/Brand\";v=\"24\"",
                "sec-ch-ua-mobile": "?0",
                "sec-ch-ua-platform": "\"macOS\"",
                "sec-fetch-dest": "document",
                "sec-fetch-mode": "navigate",
                "sec-fetch-site": "same-origin",
                "sec-fetch-user": "?1",
                "upgrade-insecure-requests": "1",
                "cookie": Object.entries(cookiesObj).reduce((acc, [key, value]) => `${acc}${key}=${value}; `, ""),
                "Referer": "https://www.fieldglass.net/past_invoice_list.do?moduleId=180&cf=1",
                "Referrer-Policy": "strict-origin-when-cross-origin"
            },
            "body": null,
            "method": "GET"
        });
        //check the response status - only 200 is valid
        if (response.status !== 200) {
            console.error(`Error while fetching the invoice details for ${link}`);
            continue;
        }
        ``
        const html = await response.text();
        if (html) {
            const filedglassInvoice = getFieldglassInvoiceDetails(link, html);
            const montoInvoice = mapFieldglassToMontoInvoice(filedglassInvoice);
            invoices.push(montoInvoice);
        }

        // get the cookies from the response headers
        const setCookies = response.headers.get('set-cookie');
        if (setCookies) {
            // split the cookies and map them to an array of objects
            const cookies = setCookies.split(';').map((cookie) => {
                const parts = cookie.split('=');
                if (parts.length === 2) {
                    const [key, value] = parts;
                    return { key: key.trim(), value: value.trim() };
                } else {
                    console.warn('Invalid cookie string:', cookie);  // Log invalid cookie strings
                    return { key: '', value: '' };  // Return an empty object for invalid cookie strings
                }
            });
            // updating the cookies object with the new cookies
            cookies.forEach((cookie) => {
                cookiesObj[cookie.key] = cookie.value;
            });
        }
        await sleep(3);

    }
    // Close the browser
    await browser.close();

    return invoices;
}