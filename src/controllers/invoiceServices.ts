import { FieldglassInvoice, MontoInvoice } from "../models/models.ts";
import * as cheerio from 'cheerio';
import { mapStatusTextToEnum, extractDataFromScript } from '../utils/utilFunctions.ts';
import * as Sentry from '@sentry/node';

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

