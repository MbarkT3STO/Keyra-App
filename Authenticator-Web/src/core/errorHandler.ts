/**
 * Global Error Handler for Keyra Authenticator Web
 * Provides centralized error handling, logging, and user-friendly error messages
 */

export interface ErrorContext {
    operation: string;
    details?: any;
    timestamp: number;
}

export class AppError extends Error {
    constructor(
        message: string,
        public code: string,
        public context?: ErrorContext
    ) {
        super(message);
        this.name = 'AppError';
    }
}

class ErrorHandler {
    private errorLog: Array<{ error: Error; context?: ErrorContext }> = [];
    private maxLogSize = 50;

    /**
     * Initialize global error handlers
     */
    init() {
        // Handle unhandled promise rejections
        window.addEventListener('unhandledrejection', (event) => {
            console.error('Unhandled promise rejection:', event.reason);
            this.logError(event.reason, {
                operation: 'unhandled_promise_rejection',
                timestamp: Date.now()
            });
            event.preventDefault();
        });

        // Handle global errors
        window.addEventListener('error', (event) => {
            console.error('Global error:', event.error);
            this.logError(event.error, {
                operation: 'global_error',
                details: {
                    message: event.message,
                    filename: event.filename,
                    lineno: event.lineno,
                    colno: event.colno
                },
                timestamp: Date.now()
            });
        });
    }

    /**
     * Log error to internal log
     */
    logError(error: Error, context?: ErrorContext) {
        this.errorLog.push({ error, context });
        
        // Keep log size manageable
        if (this.errorLog.length > this.maxLogSize) {
            this.errorLog.shift();
        }

        // In production, you could send to error tracking service (e.g., Sentry)
        if (process.env.NODE_ENV === 'production') {
            // TODO: Send to error tracking service
            console.error('[Error Tracking]', error, context);
        }
    }

    /**
     * Get user-friendly error message
     */
    getUserMessage(error: any): string {
        if (error instanceof AppError) {
            return error.message;
        }

        // Network errors
        if (error.message?.includes('fetch') || error.message?.includes('network')) {
            return 'Network error. Please check your connection and try again.';
        }

        // Authentication errors
        if (error.message?.includes('auth') || error.message?.includes('session')) {
            return 'Authentication error. Please login again.';
        }

        // Encryption errors
        if (error.message?.includes('decrypt') || error.message?.includes('encrypt')) {
            return 'Security error. Your data may be corrupted.';
        }

        // Storage errors
        if (error.message?.includes('storage') || error.message?.includes('quota')) {
            return 'Storage error. Your browser storage may be full.';
        }

        // Generic error
        return 'An unexpected error occurred. Please try again.';
    }

    /**
     * Handle async operation with error handling
     */
    async handleAsync<T>(
        operation: () => Promise<T>,
        context: ErrorContext,
        onError?: (error: Error) => void
    ): Promise<T | null> {
        try {
            return await operation();
        } catch (error: any) {
            this.logError(error, context);
            if (onError) {
                onError(error);
            }
            return null;
        }
    }

    /**
     * Get error log for debugging
     */
    getErrorLog() {
        return [...this.errorLog];
    }

    /**
     * Clear error log
     */
    clearErrorLog() {
        this.errorLog = [];
    }
}

// Export singleton instance
export const errorHandler = new ErrorHandler();

// Export helper functions
export function handleError(error: any, context?: ErrorContext): string {
    errorHandler.logError(error, context);
    return errorHandler.getUserMessage(error);
}

export async function withErrorHandling<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    onError?: (error: Error) => void
): Promise<T | null> {
    return errorHandler.handleAsync(operation, context, onError);
}
