import { initSentry } from './utils/sentry.ts';
import { getFieldglassInvoices } from './controllers/invoiceController.ts';
import { getFieldglassAuthentication } from './controllers/authFieldglass.ts';
import { FieldglassCredentials } from './models/models.ts';
import * as Sentry from '@sentry/node';
import { loadCache, saveCache } from './utils/cache.ts';
import { FROM_DATE, TO_DATE } from './utils/constants.ts'; // Import the constants

import { getDB } from './utils/mongoConnect.ts';
import { link } from 'fs';


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

