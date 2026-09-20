// In a real project, import * as Sentry from '@sentry/react-native';
// Since we might not have Sentry installed yet, we'll keep it commented or structure for easy integration.

const IS_DEV = __DEV__;

/**
 * Initialize Error Logging
 */
export const initLogging = () => {
    if (!IS_DEV) {
        // Sentry.init({ dsn: "YOUR_DSN_HERE" });
    }
};

/**
 * Log an error to Sentry/Crashlytics
 */
export const logError = (error: any, context?: string) => {
    if (IS_DEV) {
        console.error(`[LOGGING] Error in ${context || 'app'}:`, error);
    } else {
        // Sentry.captureException(error, { extra: { context } });
        // Crashlytics.recordError(error);
        console.log(`[PROD-LOG] Error in ${context}:`, error); // Fallback if SDK not init
    }
};

/**
 * Log a message/breadcrumb
 */
export const logMessage = (message: string, level: 'info' | 'warning' | 'error' = 'info') => {
    if (IS_DEV) {
        console.log(`[LOGGING] [${level.toUpperCase()}] ${message}`);
    } else {
        // Sentry.addBreadcrumb({ message, level });
    }
};
