/*
  Import Sentry & add basic context
**/
import { Sentry, sendEventBridgeAuthEvent } from "@montopay/base-scraper/utils";

import pkg from "./package.json" with { type: "json" };
//
const sentryGlobalScope = Sentry.getGlobalScope();
sentryGlobalScope.addEventProcessor(
    (event) =>
        new Promise((resolve) =>
            resolve({
                ...event,
                release: `${pkg.name}@${pkg.version}`,
            }),
        ),
);
sentryGlobalScope.setTag("scraper.name", pkg.name);
sentryGlobalScope.setTag("scraper.version", pkg.version);
sentryGlobalScope.setTag("scraper.repository", pkg.repository.url);

/*
  Import external libraries
**/
import { cloneDeep, merge } from "lodash-es";

/*
  Import internal types
**/
import { BaseDataTypes, BaseExtractorOptions, MontoInvoice } from "@montopay/base-scraper/types";
import { FgInput, FieldglassScraperOptions } from "./src-base-link/types.js";
import { cacheGet, cacheSet } from './src-base-link/new-cache.js';

/*
  Import internal constants
**/
import { MontoInvoiceStatus } from "@montopay/base-scraper/constants";

/*
  Import internal errors
**/
import {
    AuthenticationBadCredentialsError,
    AuthenticationChangePasswordError,
    ScraperInputValidationError,
} from "@montopay/base-scraper/errors";

/*
  Import internal utilities
**/
import {
    validator,
    mask,
    sendQueueMessage,
    captureExceptionWithScope,
    getPassword,
} from "@montopay/base-scraper/utils";

import { fieldglassInputSchema } from "./src-base-link/input.js";
import { FieldglassScraper } from "./src-base-link/scraper.js";

/*
  Parse input & mask password & set extra context (without password)
**/
const input = <FgInput>JSON.parse(<string>process.env.INPUT);
const maskedInput = cloneDeep(input);
if (maskedInput?.user?.password) {
    maskedInput.user.password = mask(maskedInput.user.password);
}

Sentry.setUser({ username: `${input.user.customer}@${input.user.username}` });
sentryGlobalScope.setExtra("Scraper Input", maskedInput);

/*
  Validate input & apply default values
**/
validator.validate(fieldglassInputSchema, input);

if (validator.errors) {
    const cause = {
        schema: fieldglassInputSchema.$id,
        errors: validator.errors,
    };
    throw new ScraperInputValidationError(`${fieldglassInputSchema.$id} validation error`, { cause });
}

/*
  Set credentials
**/
const { invoices } = input;
const credentials = {
    rootUrl: input.user.rootUrl,
    username: input.user.username,
    password: <string>input.user.password ?? (await getPassword(<string>input.user.passwordKey)),
};

/*
  Set extractors, currently only invoice extractor is supported for Fg scraper
**/
const extractors = <Record<string, BaseExtractorOptions>>{};
if (input.invoices) {
    extractors.invoices = <BaseExtractorOptions>{
        dateRange: {
            fromDate: invoices?.fromDate,
            toDate: invoices?.toDate,
        },
    };
}

const options: FieldglassScraperOptions = { extractors };
const scraper = new FieldglassScraper(credentials, options);

/*
  Data handler
**/
const dataEventType = "data";
const dataEventHandler = async (type: BaseDataTypes, data: MontoInvoice) => {
    if (type === BaseDataTypes.MAPPED_INVOICE) {
        const overrides = {
            portal_user_id: input.user._id,
            customer_name: input.user.customer,
            portal_user: input.user.username,
            username: input.user.username,
        };

        const queueUrl = "";
        const messageAttributes = {};

        /*
          Skip draft invoices
        **/
        if (data.status === MontoInvoiceStatus.DRAFT) return;

        await sendQueueMessage(queueUrl, merge(data, overrides), messageAttributes).catch((err: any) =>
            scraper.logger.error(err),
        );
    }
};
scraper.on(dataEventType, dataEventHandler);

/*
  Error handler
**/
const errorEventType = "error";
const errorEventHandler = async (err: Error) => {
    scraper.logger.error(err);

    if (err instanceof AuthenticationBadCredentialsError || err instanceof AuthenticationChangePasswordError) {
        const authEventBridgeDetail = {
            jobId: input.job_id,
            portalId: input.portal_id,
            portalUserId: input.user._id,
            authEvent: "failure",
            failReason: err.name,
        };

        // @ts-ignore
        await sendEventBridgeAuthEvent("fg", input.eventBus, authEventBridgeDetail);
    }

    const page = scraper.initialized ? scraper.page : undefined;
    await captureExceptionWithScope(err, "error", {}, {}, page);
};
scraper.on(errorEventType, errorEventHandler);

const authenticationSuccessEventType = "authentication:success";
const authenticationSuccessEventHandler = async () => {
    const authEventBridgeDetail = {
        jobId: input.job_id,
        portalId: input.portal_id,
        portalUserId: input.user._id,
        authEvent: "success",
    };

    // @ts-ignore
    await sendEventBridgeAuthEvent("fg", input.eventBus, authEventBridgeDetail);
};
scraper.on(authenticationSuccessEventType, authenticationSuccessEventHandler);

/*
  Run scraper
**/

await scraper
    .init()
    .then((scraper) => scraper.scrape())
    .catch(async (err) => await errorEventHandler(err))
    .finally(async () => {
        console.log(scraper.extractors.invoices);
        await scraper.close();
    });

