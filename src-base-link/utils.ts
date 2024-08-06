import { Page } from "puppeteer";
import * as cheerio from 'cheerio';
// import { cloneDeep } from "lodash-es";
import { format, sub } from "date-fns";
import pRetry from "p-retry";
import delay from "delay";
import { BaseDataTypes, BaseUtilityOptions, GenericInvoice, MontoInvoice } from "@montopay/base-scraper/types";
import { FieldglassAuthentication, FieldglassCredentials, FieldglassInvoice, MontoInvoiceStatus } from "./types.ts";
import { AuthenticationBadCredentialsError, AuthenticationChangePasswordError, InvoiceUnknownStatusError } from "@montopay/base-scraper/errors";
// import { MontoInvoiceStatus } from "@montopay/base-scraper/constants";
import { PORTAL_NAME, DEFAULT_COOKIES, DEFAULT_HEADERS, INVOICE_MAPPED_STATUSES, KEYBOARD_TYPE_DELAY, PASSWORD_INPUT_SELECTOR, RETRIES, TIME_BETWEEN_REQUESTS, USERNAME_INPUT_SELECTOR, WRONG_IDENTIFIERS_HEADER_SELECTOR, DATA_TYPE_MAP } from "./constants.ts";
import { cacheGet, cacheSet } from "./new-cache.ts";
import { Sentry } from "@montopay/base-scraper/utils";


export async function getFieldglassAuthentication(credentials: FieldglassCredentials, page: Page, options: BaseUtilityOptions = {}): Promise<FieldglassAuthentication> {
    const cachedAuthData = cacheGet(credentials);
    // check if the token is already in the cache
    if (cachedAuthData) {
        return cachedAuthData;
    }

    // If no cached data, perform the authentication process using Puppeteer
    const { rootUrl, username, password } = credentials;
    const { logger } = options;
    if (logger) {
        logger.info(`Getting authentication for username ${username}.`);
    }

    try {
        await page.goto(rootUrl, { waitUntil: 'load' });
        const cookieStatement = await page.$("#truste-consent-track");
        if (cookieStatement) {
            await page.click("#truste-consent-button");
        }

        await sleep(3);
        // Login
        await page.type('#usernameId_new', username);
        await sleep(1);
        await page.type('#passwordId_new', password);
        // Check if the cookie statement is present
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle2' }),
            page.click('button[type="submit"]')
        ]);

        const authToken = await page.cookies()

        if (!authToken) {
            Sentry.captureException(new Error("Authentication failed"));
            throw new Error("Authentication failed");
        }
        const ttl = 5 * 60 * 1000;
        const now = new Date().getTime();
        const expiration = now + ttl;

        // cache the authentication data
        cacheSet(credentials, { authToken, expiration }, ttl);

        return { authToken, expiration, rootUrl, username };

    } catch (error) {
        Sentry.captureException(error);
        throw new Error("Error while getting the authentication token");
    }

}


/**
 * using Puppeteer to fetch and parse HTML, and Cheerio to process it
 * @param authentication
 * @param fromDate
 * @param toDate
 * @returns invoices of type MontoInvoice[]
 */
export async function getFieldglassInvoices(page: Page,
    credentials: FieldglassCredentials, authentication: FieldglassAuthentication, fromDate: string, toDate: string, options: BaseUtilityOptions = {}):
    Promise<MontoInvoice[]> {

    let invoices: MontoInvoice[] = [];

    // Set the authentication token in headers
    await page.setCookie(...authentication.authToken)

    // Navigate to the invoices page
    await page.goto(process.env.FG_INVOICES_URL!, {
        waitUntil: "networkidle2"
    });

    // Set date filters
    const formattedFromDate = convertDateFormat(fromDate);
    const formattedToDate = convertDateFormat(toDate);
    await setDateFilters(page, formattedFromDate, formattedToDate);

    // Select the dropdown list to show all invoices
    await selectDropdown(page);

    await page.waitForSelector('.jqxGridParent.fd-table');

    let hasNextPage = true;

    do {
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

        // Check if there is a next page
        hasNextPage = await navigateToNextpage(page);
    } while (hasNextPage);

    return invoices;
}

export async function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

export function convertDateFormat(dateString: string): string {
    const [year, month, day] = dateString.split("-");
    return `${month}/${day}/${year}`;
}

/**
 * Set date filters on the Fieldglass page.
 * @param page Puppeteer Page object.
 * @param fromDate Start date for filtering.
 * @param toDate End date for filtering.
 */
export async function setDateFilters(page: Page, fromDate: string, toDate: string): Promise<void> {
    // input the date range for filtering invoices
    await page.waitForSelector('input[name="filterStartDate"]').then(async (el) => {
        await el!.click({ clickCount: 3 });
        await el!.type(fromDate.replace(/-/g, '/'));
    });
    await page.waitForSelector('input[name="filterEndDate"]').then(async (el) => {
        await el!.click({ clickCount: 3 });
        await el!.type(toDate.replace(/-/g, '/'));
    });

    await page.click('.ttFilterButton');

    // Sleep function to wait for the page to load
    await sleep(3);
}

/**
 * Select the dropdown list to show all invoices on the Fieldglass page.
 * @param page Puppeteer Page object.
 */
export async function selectDropdown(page: Page): Promise<void> {
    const dropdown_list = await page.waitForSelector('#dropdownlistWrappergridpagerlistpast_invoice_supplier_list', { visible: true });
    await dropdown_list!.click();
    await page.waitForSelector('#listitem7innerListBoxgridpagerlistpast_invoice_supplier_list > span', { visible: true });
    await sleep(1);
    await page.click('#listitem7innerListBoxgridpagerlistpast_invoice_supplier_list > span');
    await sleep(1);
}

/**
 * Parses the HTML content of an invoice page and extracts the invoice details.
 * @param html - The HTML content of the invoice page.
 * @returns A FieldglassInvoice object containing the extracted details.
 */
export function getFieldglassInvoiceDetails(link: string, html: string): FieldglassInvoice {
    const $ = cheerio.load(html);
    const fgInvoiceId = link.split('id=')[1].split('&')[0];
    const fgPortalName = 'Fieldglass';
    const fgInvoiceNumber = $('table.box tr:contains("Invoice Code") td').text().trim();
    const fgPoNumber = $('table.box tr:contains("PO Number") td').text().trim();
    const fgInvoiceEndDateText = $('table.box tr:contains("End Date") td').text().trim();
    const fgCurrency = $('#invoiceDetails .fd-container h3').first().text().match(/\(([^)]+)\)/)?.[1]; // Applying the regex to find text within parentheses
    if (!fgCurrency) {
        Sentry.captureException(new Error('Currency not found'));
        throw new Error('Currency not found');
    }
    const fgTotalText = $('table.box tr:contains("Total Amount Due") td').text().trim();

    // Extract the script content where the other details are stored
    const scriptContent = $('script').filter((_, script): any => {
        return $(script).html()?.includes('initBadge');
    }).html() || '';

    // Extract the status, submit date, and buyer from the script content
    const scrapedData = extractDataFromScript(scriptContent);

    // Extract values within the script content
    const fgBuyer = scrapedData['buyer'];
    const fgStatusText = scrapedData['status'];
    const fgSubmitDateText = scrapedData['submitDate'];

    // Converting 
    const fgSubmitDate = new Date(fgSubmitDateText);
    const fgInvoiceEndDate = new Date(fgInvoiceEndDateText);
    const fgTotal = parseFloat(fgTotalText.replace(/,/g, ''));

    return {
        id: fgInvoiceId,
        portal_name: fgPortalName,
        invoice_number: fgInvoiceNumber,
        po_number: fgPoNumber,
        buyer: fgBuyer,
        status: fgStatusText,
        invoice_date: fgSubmitDate,
        due_date: fgInvoiceEndDate,
        currency: fgCurrency,
        total: fgTotal
    } satisfies FieldglassInvoice;
}

/**
 * Maps a FieldglassInvoice object to a MontoInvoice object.
 * @param fieldglassInvoice - The FieldglassInvoice object to map.
 * @returns A MontoInvoice object containing the mapped details.
 */
export function mapFieldglassToMontoInvoice(fieldglassInvoice: FieldglassInvoice): MontoInvoice {
    return {
        portal_name: fieldglassInvoice.portal_name,
        id_on_portal: fieldglassInvoice.id,
        invoice_number: fieldglassInvoice.invoice_number,
        // portal_invoice_number: fieldglassInvoice.invoice_number, 
        po_number: fieldglassInvoice.po_number,
        buyer: fieldglassInvoice.buyer,
        status: mapStatusTextToEnum(fieldglassInvoice.status), // convert the status text to the enum value
        invoice_date: fieldglassInvoice.invoice_date,
        currency: fieldglassInvoice.currency,
        total: fieldglassInvoice.total,
        portal_user_id: undefined,
        portal_user: undefined,
        username: undefined
    } as MontoInvoice;
}

/**
 * Navigates to the next page on the Fieldglass invoices table.
 * @param page Puppeteer Page object.
 * @returns A boolean indicating if there are more pages to navigate to.
 */
export async function navigateToNextpage(page: Page): Promise<boolean> {
    try {
        // Get the current and total elements text
        const pageInfoText = await page.evaluate(() => {
            const element = document.querySelector('div[style*="margin-right: 7px; float: right;"]');
            if (!element || !element.textContent) {
                Sentry.captureException(new Error('Page info element not found or has no text content'));
                throw new Error('Page info element not found or has no text content');
            }
            return element.textContent.trim();
        });

        // Define a regular expression to extract numbers
        const pageInfoRegex = /(\d+)-(\d+) of (\d+)/;
        // Match the text content against the regular expression
        const match = pageInfoText.match(pageInfoRegex);

        if (match) {
            // Extract the current end index and total number
            const currentEnd = parseInt(match[2], 10);
            const total = parseInt(match[3], 10);

            // Determine if there are more pages
            if (currentEnd >= total) {
                return false;
            } else {
                try {
                    const nextPageButton = await page.waitForSelector('div[title="Next"]', { visible: true, timeout: 10000 });
                    if (nextPageButton) {
                        await nextPageButton.click();
                        await page.waitForSelector('.jqxGridParent.fd-table');
                        await sleep(1);
                        return true;
                    } else {
                        console.error('Next page button not found or not clickable');
                        return false;
                    }
                } catch (error) {
                    console.error('Next page button not found or not clickable:', error);
                    return false;
                }
            }
        } else {
            Sentry.captureException(new Error('Unable to parse page info'));
            console.error('Unable to parse page info`:', pageInfoText);
            return false;
        }
    } catch (error) {
        Sentry.captureException(error);
        console.error('Error during navigation:', error);
        return false;
    }
}

// creating an object to map the status text to the enum
export const mapStatusObject: Record<string, MontoInvoiceStatus> = {
    "Aprroval Paused": MontoInvoiceStatus.REJECTED,
    Approved: MontoInvoiceStatus.APPROVED,
    Consolidated: MontoInvoiceStatus.APPROVED,
    // Draft: ??? // not needed
    Paid: MontoInvoiceStatus.PAID,
    "Payment Pending": MontoInvoiceStatus.PENDING_APPROVAL,
    "Payment Review": MontoInvoiceStatus.PENDING_APPROVAL,
    "Pending Approval": MontoInvoiceStatus.PENDING_APPROVAL,
    "Pending Consolidation": MontoInvoiceStatus.PENDING_APPROVAL,
    "Pending SAP Quality Review": MontoInvoiceStatus.PENDING_APPROVAL,
    Rejected: MontoInvoiceStatus.REJECTED,
}

export function mapStatusTextToEnum(statusText: string): MontoInvoiceStatus {
    const mappedStatus: MontoInvoiceStatus = mapStatusObject[statusText];
    if (!mappedStatus) {
        throw new Error(`Unknown status: ${statusText}`);
    }
    return mappedStatus as MontoInvoiceStatus;
}

/**
 * Extracts data from the script content 
 * @param scriptContent - The content of the script tag.
 * @returns 3 properties: status, submitDate, and buyer.
 */
export function extractDataFromScript(scriptContent: string): { status: string; submitDate: string; buyer: string } {
    let fgStatusText = '';
    let fgSubmitDateText = '';
    let fgBuyer = '';
    const match = scriptContent.match(/initBadge\((\{.*?\})\s*,\s*'invoiceBadge'/s);
    if (match && match[1]) {
        try {
            const jsonObject = JSON.parse(match[1]);
            const items = jsonObject.items;
            items.forEach((item: any) => {
                switch (item.key) {
                    case 'Status':
                        fgStatusText = item.value;
                        break;
                    case 'Submit Date':
                        fgSubmitDateText = item.value;
                        break;
                    case 'Buyer':
                        fgBuyer = item.value;
                        break;
                }
            });
        } catch (error) {
            Sentry.captureException(error);
            throw new Error('Failed to parse script data');
        }
    }

    return {
        status: fgStatusText,
        submitDate: fgSubmitDateText,
        buyer: fgBuyer,
    };
}