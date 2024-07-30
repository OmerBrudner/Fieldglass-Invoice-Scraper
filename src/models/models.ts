import { Cookie } from "puppeteer";

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
    status: string;
    invoice_date: Date;
    due_date?: Date;
    currency: string;
    total: number;
};

export type MontoInvoice = {
    portal_name: string;
    // type: MontoDataTypes;
    id_on_portal: string;
    invoice_number: string;
    portal_invoice_number?: string;
    po_number?: string;
    buyer: string;
    status: string;
    invoice_date: Date;
    due_date?: Date;
    currency: string;
    total: number;
    portal_user_id?: string;
    portal_user?: string;
    username?: string;
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
    authToken: Cookie[];
    expiration: number;
}

export type InvoiceFilters = {
    invoice_date_start?: Date;
    invoice_date_end?: Date;
    portal_name?: string;
    status?: MontoInvoiceStatus;
}


