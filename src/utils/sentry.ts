import * as Sentry from '@sentry/node';

// init Sentry
export function initSentry() {
    Sentry.init({
        dsn: process.env.DSN_SENTRY,
    });
};
