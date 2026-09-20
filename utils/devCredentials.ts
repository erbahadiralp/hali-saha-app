/**
 * Credentials for the local test/seed accounts used by the developer panel.
 *
 * These are read from .env (which is gitignored) so that no password ever lands
 * in the repository. Every caller sits behind a `__DEV__` guard; if the values
 * are missing the dev actions fail closed instead of trying a blank password.
 */

/** Shared password for the seeded test accounts (admin/guest/playerN). */
export const DEV_TEST_PASSWORD = process.env.EXPO_PUBLIC_DEV_TEST_PASSWORD ?? '';

/** Domain used for every seeded test account. Not a real mailbox anywhere. */
export const DEV_TEST_EMAIL_DOMAIN = 'halisaha.com';

/** Username of the personal account the "custom" dev login shortcut signs into. */
export const DEV_OWNER_USERNAME = process.env.EXPO_PUBLIC_DEV_OWNER_USERNAME ?? '';

/** Password for the account named by DEV_OWNER_USERNAME. */
export const DEV_OWNER_PASSWORD = process.env.EXPO_PUBLIC_DEV_OWNER_PASSWORD ?? '';

/** True when the seeded test accounts can be used. */
export const hasDevTestPassword = (): boolean => DEV_TEST_PASSWORD.length > 0;

/** True when the personal dev login shortcut is configured. */
export const hasDevOwnerCredentials = (): boolean =>
    DEV_OWNER_USERNAME.length > 0 && DEV_OWNER_PASSWORD.length > 0;

/** Message shown when a dev action runs without the matching .env entries. */
export const DEV_CREDENTIALS_MISSING_MESSAGE =
    'Geliştirici hesap bilgileri tanımlı değil. .env dosyasına EXPO_PUBLIC_DEV_* değerlerini ekleyin.';
