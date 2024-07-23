
import { Protocol } from "puppeteer";
import { Cookie } from "../utils/puppeteer-types.ts";

export enum MontoInvoiceStatus {
    APPROVED = "Approved",
    PENDING_APPROVAL = "Pending Approval",
    PAID = "Paid",
    REJECTED = "Rejected",
    CANCELED = "Canceled",
};

export type FieldglassInvoice = {
    id: string;
    portal_name: string;
    invoice_number: string;
    po_number?: string;
    buyer: string;
    status: MontoInvoiceStatus;
    invoice_date: Date;
    currency: string;
    total: number;
};

// additional query parameters for date range, inorder to maintainthe original montoInvoice structure
export type FieldglassInvoiceQuery = Partial<FieldglassInvoice> & {
    invoice_date_start?: string;
    invoice_date_end?: string;
};

export type CacheData = {
    data: any;
    expiration: number;
}

export type FieldglassCredentials = {
    rootUrl: string;
    userName: string;
    password: string;
}

export type FieldglassAuthentication = {
    authToken: Protocol.Network.CookieParam[];
    expiration: number;
}

export type InvoiceFilters = {
    invoice_date_start?: Date;
    invoice_date_end?: Date;
    portal_name?: string;
    status?: MontoInvoiceStatus;
}


