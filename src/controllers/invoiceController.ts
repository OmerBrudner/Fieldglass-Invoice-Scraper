import puppeteer from "puppeteer";
import { FieldglassAuthentication, FieldglassInvoice } from "src/models/models.ts";
import { getFieldglassInvoiceDetails, sleep } from "./invoiceServices.ts";
import fetch from "node-fetch";


export async function getFieldglassInvoices(authentication: FieldglassAuthentication, fromDate: string, toDate: string): Promise<FieldglassInvoice[]> {
    // const { authToken } = authentication;
    let invoices: FieldglassInvoice[] = [];
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

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
    await page.click('#listitem7innerListBoxgridpagerlistpast_invoice_supplier_list > span');

    await page.waitForSelector('.jqxGridParent.fd-table');
    // Extract invoice links from the table
    const invoicesLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('.jqxGridParent.fd-table .archiveLink'));
        return links.map(link => (link as HTMLAnchorElement).href);
    });
    console.log('invoiceLinks', invoicesLinks);

    let newCookies = await page.cookies();
    let cookiesObj = newCookies.reduce((acc, cookie) => {
        // @ts-ignore
        acc[cookie.name] = cookie.value;
        return acc;
    });

    for (const link of invoicesLinks) {
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
        const html = await response.text();
        if (html) {
            invoices.push(getFieldglassInvoiceDetails(html)); // to implement
        }
        const setCookies = response.headers.get('set-cookie');
        if (setCookies) {
            const cookies = setCookies.split(';').map((cookie) => { const [key, value] = cookie.split('='); return { key, value }; });
            cookies.forEach((cookie) => {
                // @ts-ignore
                cookiesObj[cookie.key] = cookie.value;
            });
        }
        await sleep(3);

    }
    // Close the browser
    await browser.close();

    return invoices as FieldglassInvoice[];
}