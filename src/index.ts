import { initSentry } from './utils/sentry.ts';
import { getFieldglassInvoices } from './controllers/invoiceController.ts';
import { getFieldglassAuthentication } from './controllers/authFieldglass.ts';
import { FieldglassCredentials } from './models/models.ts';
import * as Sentry from '@sentry/node';
import { loadCache, saveCache } from './utils/cache.ts';
import { FROM_DATE, TO_DATE } from './utils/constants.ts'; // Import the constants

import { getDB } from './utils/mongoConnect.ts';
// import { MontoDataTypes } from "@montopay/base-scraper/src/base_types";

// interface FieldglassCredentials {
//   rootUrl: string;
//   username: string;
//   password: string;
// }

// interface FieldglassAuthentication {
//   token: string;
//   session_id: string;
// }

// interface FieldglassInvoice {
//   id: string;
//   status: string;
// }

// type MontoInvoice = {
//   portal_name: string;
//   type: MontoDataTypes;
//   /**
//    * Unique invoice ID from portal, important because different invoices
//    * can have the same invoice number
//    */
//   id_on_portal: string;
//   /**
//    * Usually, invoice_number and portal_invoice_number are the same
//    */
//   invoice_number: string;
//   portal_invoice_number?: string;
//   po_number?: string;
//   buyer: string;
//   status: string;
//   invoice_date: Date;
//   due_date?: Date;
//   currency: string;
//   total: number;
//   /**
//    * Portals like Bill can have multiple users for the same account
//    */
//   portal_user_id?: string;
//   portal_user?: string;
//   /**
//    * Username for the credentials.
//    */
//   username?: string;
// };


// async function getFieldglassAuthentication(credentials: FieldglassCredentials): Promise<FieldglassAuthentication> {

// }

// // 2024-01-01
// async function getFieldglassInvoices(authentication: FieldglassAuthentication, fromDate: string, toDate: string): Promise<FieldglassInvoice[]> {

// }

// async function getFieldglassInvoiceDetails(authentication: FieldglassAuthentication, invoice: FieldglassInvoice) {

// }

// function mapFieldglassInvoice(invoice: FieldglassInvoice): Promise<MontoInvoice> {

// }

const credentials: FieldglassCredentials = {
  rootUrl: process.env.FG_URL!,
  userName: process.env.FG_USERNAME!,
  password: process.env.FG_PASSWORD!,
};

initSentry();

const start = async () => {
  try {
    await loadCache();
    // Authenticate and get the token
    const authData = await getFieldglassAuthentication(credentials);
    // Get the invoices within the date range
    const invoices = await getFieldglassInvoices(authData, FROM_DATE, TO_DATE);
    console.log(invoices);
  }
  catch (error) {
    Sentry.captureException(error);
    console.error('Error while getting the invoices', error);
  }
  finally {
    await saveCache(); // Save the cache data
  }
};

(async () => {
  await start();
})();

