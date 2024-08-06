import { FieldglassInvoice, MontoInvoice } from "../models/models.ts";
import * as cheerio from 'cheerio';
import { mapStatusTextToEnum, extractDataFromScript } from '../utils/utilFunctions.ts';
import * as Sentry from '@sentry/node';
import puppeteer from "puppeteer";
import { sleep } from "../utils/utilFunctions.ts";

/**
 * Set date filters on the Fieldglass page.
 * @param page Puppeteer Page object.
 * @param fromDate Start date for filtering.
 * @param toDate End date for filtering.
 */
export async function setDateFilters(page: puppeteer.Page, fromDate: string, toDate: string): Promise<void> {
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
export async function selectDropdown(page: puppeteer.Page): Promise<void> {
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
export async function navigateToNextpage(page: puppeteer.Page): Promise<boolean> {
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