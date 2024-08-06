import { Page } from "puppeteer";
import { BaseDataTypes, BaseUtilityOptions, MontoInvoice } from "@montopay/base-scraper/types";
import { FieldglassAuthentication, FieldglassCredentials, FieldglassExtractors, FieldglassInvoice, FieldglassScraperOptions } from "./types.ts";
import { BaseExtractor, BaseHeadlessScraper } from "@montopay/base-scraper";
import { getFieldglassAuthentication, getFieldglassInvoices, mapFieldglassToMontoInvoice } from "./utils.ts";
import { ScraperNotInitializedError } from "@montopay/base-scraper/errors";
import { SCRAPER_NAME, RETRIES, TIME_BETWEEN_REQUESTS } from "./constants.ts";
import pRetry from "p-retry";

export class FieldglassScraper extends BaseHeadlessScraper<FieldglassCredentials, FieldglassAuthentication, FieldglassScraperOptions> {
    protected _name = SCRAPER_NAME;
    public declare authentication?: FieldglassAuthentication;
    public extractors: FieldglassExtractors = {};

    public constructor(credentials: FieldglassCredentials, options: FieldglassScraperOptions) {
        super(credentials, options);
        if (options.extractors.invoices) {
            this.extractors.invoices = new BaseExtractor<FieldglassCredentials, MontoInvoice>(options.extractors.invoices);
        }
    }

    public async scrape(): Promise<FieldglassScraper> {
        const { verbose, logger } = this;
        const options: BaseUtilityOptions = {
            onError: this.onError.bind(this),
            onData: this.onData.bind(this),
        };
        const page = this.page as unknown as Page;

        if (verbose) {
            logger.info(`${this.name} started.`);
            options.logger = logger;
        }

        if (!this.initialized) {
            throw new ScraperNotInitializedError(`${this.name} not initialized.`);
        }

        if (!this.authentication) {
            this.authentication! = await getFieldglassAuthentication(this._credentials, page, options);
            this.emit("authentication:success", this.authentication);
        }

        if (this.extractors.invoices) {
            const extractor = this.extractors.invoices;
            const { fromDate, toDate } = extractor;
            extractor.clean();

            const eventType = "data";
            const eventListener = (type: BaseDataTypes, data: FieldglassInvoice) => {
                if (type === BaseDataTypes.INVOICE) {
                    const mappedInvoice = mapFieldglassToMontoInvoice(data);
                    extractor.mapped.push(mappedInvoice);
                }
            };
            this.on(eventType, eventListener);

            try {
                // Retry logic for fetching invoices
                extractor.mapped = await pRetry(() => getFieldglassInvoices(page, this._credentials, this.authentication!, fromDate, toDate, options), {
                    retries: RETRIES,
                    factor: 2,
                    minTimeout: TIME_BETWEEN_REQUESTS,
                });

                // Emit event for extracted data
                this.emit(eventType, BaseDataTypes.INVOICE, extractor.data);
            } catch (error) {
                this.emit("error", error);
                throw error;
            } finally {
                this.off(eventType, eventListener);
            }
        }

        if (verbose) {
            logger.info(`${this.name} finished.`);
        }

        return this;
    }
}