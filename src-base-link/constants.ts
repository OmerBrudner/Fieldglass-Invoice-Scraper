import { MontoDataTypes } from "@montopay/base-scraper/types";
import { MontoInvoiceStatus } from "@montopay/base-scraper/constants";

export const SCRAPER_NAME = "FieldglassScraper";
export const PORTAL_NAME = "Fieldglass";

export const RETRIES = 3;
export const TIME_BETWEEN_REQUESTS = 1000;
export const KEYBOARD_TYPE_DELAY = 250;
export const DEFAULT_COOKIES = {};
export const DEFAULT_HEADERS = {
  "accept-language": "en-GB,en-US;q=0.9,en;q=0.8",
  "cache-control": "max-age=0",
  // other headers
};

export const USERNAME_INPUT_SELECTOR = "#username";
export const PASSWORD_INPUT_SELECTOR = "#password";
export const WRONG_IDENTIFIERS_HEADER_SELECTOR = "h2 ::-p-text(Incorrect identifiers)";

export const INVOICE_MAPPED_STATUSES = {
  // Define statuses based on Fieldglass mappings
};

export const DATA_TYPE_MAP = {
  // Define data type mappings
};
