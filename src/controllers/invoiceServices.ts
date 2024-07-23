import * as Sentry from '@sentry/node';
import { FieldglassAuthentication, FieldglassInvoice } from "src/models/models.ts";
import * as cheerio from 'cheerio';
// funtion to get the invoice details, changes to html:string instead of authentication
export async function getFieldglassInvoiceDetails(html: string, invoice: FieldglassInvoice) {

}

export function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

