import React, { Component, ErrorInfo, ReactNode } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
}

// Class component required for React Error Boundaries
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to your error reporting service (Sentry/Crashlytics)
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return <ErrorFallback error={this.state.error} onRetry={this.handleRetry} />;
        }
        return this.props.children;
    }
}

// Functional component for the fallback UI (can use hooks)
function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5' }]}>
            <View style={styles.content}>
                <Text style={styles.emoji}>⚽💥</Text>
                <Text style={[styles.title, { color: isDark ? '#ffffff' : '#111827' }]}>
                    Bir Şeyler Ters Gitti
                </Text>
                <Text style={[styles.message, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                    Beklenmedik bir hata oluştu. Lütfen tekrar deneyin.
                </Text>

                {__DEV__ && error && (
                    <View style={[styles.errorBox, { backgroundColor: isDark ? 'rgba(239,68,68,0.1)' : 'rgba(239,68,68,0.05)' }]}>
                        <Text style={styles.errorText} numberOfLines={5}>
                            {error.message}
                        </Text>
                    </View>
                )}

                <TouchableOpacity
                    onPress={onRetry}
                    style={styles.retryButton}
                    activeOpacity={0.8}
                >
                    <Text style={styles.retryText}>Tekrar Dene</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    content: {
        alignItems: 'center',
        paddingHorizontal: 32,
        maxWidth: 360,
    },
    emoji: {
        fontSize: 60,
        marginBottom: 20,
    },
    title: {
        fontSize: 22,
        fontWeight: '700',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 15,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    errorBox: {
        width: '100%',
        padding: 12,
        borderRadius: 12,
        marginBottom: 24,
        borderWidth: 1,
        borderColor: 'rgba(239,68,68,0.2)',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 12,
        fontFamily: 'monospace',
    },
    retryButton: {
        backgroundColor: '#10B981',
        paddingHorizontal: 40,
        paddingVertical: 14,
        borderRadius: 16,
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    retryText: {
        color: '#11240f',
        fontSize: 16,
        fontWeight: '700',
    },
});
