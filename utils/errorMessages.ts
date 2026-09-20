/**
 * Turkish error message mapping for Firebase/Firestore errors
 */

const ERROR_MESSAGES: Record<string, string> = {
    // Auth errors
    'auth/email-already-in-use': 'Bu e-posta adresi zaten kullanımda.',
    'auth/invalid-email': 'Geçersiz e-posta adresi.',
    'auth/user-not-found': 'E-posta veya şifre hatalı.',
    'auth/wrong-password': 'E-posta veya şifre hatalı.',
    'auth/weak-password': 'Şifre en az 6 karakter olmalıdır.',
    'auth/too-many-requests': 'Çok fazla deneme yaptınız. Lütfen birkaç dakika bekleyin.',
    'auth/network-request-failed': 'İnternet bağlantınızı kontrol edin.',
    'auth/invalid-credential': 'E-posta veya şifre hatalı.',
    'auth/user-disabled': 'Bu hesap devre dışı bırakılmış.',
    'auth/operation-not-allowed': 'Bu işlem şu anda kullanılamıyor.',
    'auth/requires-recent-login': 'Güvenlik nedeniyle tekrar giriş yapmanız gerekiyor.',

    // Firestore errors
    'permission-denied': 'Bu işlemi yapma yetkiniz yok.',
    'not-found': 'İstenilen kayıt bulunamadı.',
    'already-exists': 'Bu kayıt zaten mevcut.',
    'resource-exhausted': 'Çok fazla istek gönderildi. Lütfen bekleyin.',
    'failed-precondition': 'İşlem ön koşulları sağlanmıyor.',
    'aborted': 'İşlem iptal edildi. Tekrar deneyin.',
    'unavailable': 'Sunucu şu anda kullanılamıyor. İnternet bağlantınızı kontrol edin.',
    'deadline-exceeded': 'İşlem zaman aşımına uğradı. Tekrar deneyin.',
    'cancelled': 'İşlem iptal edildi.',
    'data-loss': 'Veri kaybı yaşandı. Lütfen tekrar deneyin.',
    'internal': 'Sunucu hatası. Lütfen tekrar deneyin.',
    'unimplemented': 'Bu özellik henüz desteklenmiyor.',

    // Custom app errors
    'MATCH_FULL': 'Maç dolu! Yedek listesine eklenebilirsiniz.',
    'USERNAME_TAKEN': 'Bu kullanıcı adı zaten alınmış.',
    'GROUP_FULL': 'Grup kapasitesi dolu.',
    'ALREADY_MEMBER': 'Zaten bu grubun üyesisiniz.',
    'RATE_LIMITED': 'Çok fazla deneme yaptınız. Lütfen bekleyin.',
};

/**
 * Get user-friendly Turkish error message
 */
export function getErrorMessage(error: any): string {
    if (!error) return 'Bilinmeyen bir hata oluştu.';

    // String error (custom throw)
    if (typeof error === 'string') {
        return ERROR_MESSAGES[error] || error;
    }

    // Firebase error with code
    const code = error?.code || error?.message || '';

    // Check direct match
    if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];

    // Check partial match (auth/xxx format)
    for (const key of Object.keys(ERROR_MESSAGES)) {
        if (code.includes(key)) return ERROR_MESSAGES[key];
    }

    // Firestore error code in message
    if (error?.message) {
        for (const key of Object.keys(ERROR_MESSAGES)) {
            if (error.message.includes(key)) return ERROR_MESSAGES[key];
        }
    }

    // Generic fallback
    return 'Bir hata oluştu. Lütfen tekrar deneyin.';
}
