import { MontoInvoiceStatus } from "../models/models.ts";
import * as Sentry from '@sentry/node';

export async function sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// creating an object to map the status text to the enum
export const mapStatusObject: Record<string, MontoInvoiceStatus> = {
    // "Aprroval Paused": ???
    Approved: MontoInvoiceStatus.APPROVED,
    // Consolidated: ???
    // Draft: ???
    Paid: MontoInvoiceStatus.PAID,
    // "Payment Pending": ???
    // "Payment Review": ???
    "Pending Approval": MontoInvoiceStatus.PENDING_APPROVAL,
    // "Pending Consolidation": ???
    // "Pending SAP Quality Review": ???
    Rejected: MontoInvoiceStatus.REJECTED,

    // No Canceled in the dropdown
}

export function mapStatusTextToEnum(statusText: string): MontoInvoiceStatus {
    const mappedStatus: MontoInvoiceStatus = mapStatusObject[statusText];
    if (!mappedStatus) {
        throw new Error(`Unknown status: ${statusText}`);
    }
    return mappedStatus as MontoInvoiceStatus;
}

// /**
//  * Parses a date string in 'MM/DD/YYYY' format to 'YYYY-MM-DD' format.
//  * @param dateString - The date string to parse.
//  * @returns The date string in 'YYYY-MM-DD' format.
//  */
// export function parseDate(dateString: string): Date {
//     const [month, day, year] = dateString.split('/');
//     return new Date(`${year}-${month}-${day}`);
// }

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

