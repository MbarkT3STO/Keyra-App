/**
 * Rate Limiter for Security Operations
 * Prevents brute force attacks and abuse
 */

interface RateLimitConfig {
    maxAttempts: number;
    windowMs: number;
    blockDurationMs: number;
}

interface AttemptRecord {
    count: number;
    firstAttempt: number;
    blockedUntil?: number;
}

class RateLimiter {
    private attempts: Map<string, AttemptRecord> = new Map();
    private configs: Map<string, RateLimitConfig> = new Map();

    constructor() {
        // Default configurations
        this.configs.set('login', {
            maxAttempts: 5,
            windowMs: 15 * 60 * 1000, // 15 minutes
            blockDurationMs: 30 * 60 * 1000 // 30 minutes block
        });

        this.configs.set('sync', {
            maxAttempts: 10,
            windowMs: 60 * 1000, // 1 minute
            blockDurationMs: 5 * 60 * 1000 // 5 minutes block
        });

        this.configs.set('verification', {
            maxAttempts: 3,
            windowMs: 10 * 60 * 1000, // 10 minutes
            blockDurationMs: 60 * 60 * 1000 // 1 hour block
        });

        // Clean up old records every 5 minutes
        setInterval(() => this.cleanup(), 5 * 60 * 1000);
    }

    /**
     * Check if an operation is allowed
     */
    public isAllowed(operation: string, identifier: string): { allowed: boolean; remainingAttempts?: number; blockedUntil?: Date; message?: string } {
        const key = `${operation}:${identifier}`;
        const config = this.configs.get(operation);

        if (!config) {
            console.warn(`No rate limit config for operation: ${operation}`);
            return { allowed: true };
        }

        const now = Date.now();
        const record = this.attempts.get(key);

        // Check if currently blocked
        if (record?.blockedUntil && record.blockedUntil > now) {
            const blockedUntilDate = new Date(record.blockedUntil);
            const minutesRemaining = Math.ceil((record.blockedUntil - now) / 60000);
            return {
                allowed: false,
                blockedUntil: blockedUntilDate,
                message: `Too many attempts. Please try again in ${minutesRemaining} minute${minutesRemaining > 1 ? 's' : ''}.`
            };
        }

        // Check if window has expired
        if (record && (now - record.firstAttempt) > config.windowMs) {
            // Reset the record
            this.attempts.delete(key);
            return { allowed: true, remainingAttempts: config.maxAttempts };
        }

        // Check attempt count
        if (record && record.count >= config.maxAttempts) {
            // Block the user
            record.blockedUntil = now + config.blockDurationMs;
            const blockedUntilDate = new Date(record.blockedUntil);
            const minutesRemaining = Math.ceil(config.blockDurationMs / 60000);
            return {
                allowed: false,
                blockedUntil: blockedUntilDate,
                message: `Too many attempts. Blocked for ${minutesRemaining} minutes.`
            };
        }

        const remainingAttempts = config.maxAttempts - (record?.count || 0);
        return { allowed: true, remainingAttempts };
    }

    /**
     * Record an attempt
     */
    public recordAttempt(operation: string, identifier: string): void {
        const key = `${operation}:${identifier}`;
        const now = Date.now();
        const record = this.attempts.get(key);

        if (!record) {
            this.attempts.set(key, {
                count: 1,
                firstAttempt: now
            });
        } else {
            record.count++;
        }
    }

    /**
     * Reset attempts for a specific identifier (e.g., after successful login)
     */
    public reset(operation: string, identifier: string): void {
        const key = `${operation}:${identifier}`;
        this.attempts.delete(key);
    }

    /**
     * Get remaining attempts
     */
    public getRemainingAttempts(operation: string, identifier: string): number {
        const key = `${operation}:${identifier}`;
        const config = this.configs.get(operation);
        const record = this.attempts.get(key);

        if (!config) return Infinity;
        if (!record) return config.maxAttempts;

        return Math.max(0, config.maxAttempts - record.count);
    }

    /**
     * Clean up expired records
     */
    private cleanup(): void {
        const now = Date.now();
        const keysToDelete: string[] = [];

        this.attempts.forEach((record, key) => {
            const operation = key.split(':')[0];
            const config = this.configs.get(operation);

            if (!config) {
                keysToDelete.push(key);
                return;
            }

            // Remove if window expired and not blocked
            if ((now - record.firstAttempt) > config.windowMs && (!record.blockedUntil || record.blockedUntil < now)) {
                keysToDelete.push(key);
            }
        });

        keysToDelete.forEach(key => this.attempts.delete(key));
    }

    /**
     * Get statistics for monitoring
     */
    public getStats(): { operation: string; identifier: string; attempts: number; blocked: boolean }[] {
        const now = Date.now();
        const stats: { operation: string; identifier: string; attempts: number; blocked: boolean }[] = [];

        this.attempts.forEach((record, key) => {
            const [operation, identifier] = key.split(':');
            stats.push({
                operation,
                identifier,
                attempts: record.count,
                blocked: !!(record.blockedUntil && record.blockedUntil > now)
            });
        });

        return stats;
    }
}

// Singleton instance
export const rateLimiter = new RateLimiter();
