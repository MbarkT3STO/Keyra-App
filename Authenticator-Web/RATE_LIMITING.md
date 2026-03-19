# Rate Limiting Implementation

## Overview
Rate limiting has been implemented to prevent brute force attacks and abuse of the authentication system and sync operations.

## Features

### 1. Login Rate Limiting
- **Max Attempts**: 5 failed attempts
- **Time Window**: 15 minutes
- **Block Duration**: 30 minutes after exceeding limit
- **User Feedback**: Shows remaining attempts when 3 or fewer remain
- **Reset**: Automatically resets on successful login

### 2. Email Verification Rate Limiting
- **Max Attempts**: 3 failed attempts
- **Time Window**: 10 minutes
- **Block Duration**: 1 hour after exceeding limit
- **User Feedback**: Shows remaining attempts after each failed attempt
- **Reset**: Automatically resets on successful verification

### 3. Sync Operations Rate Limiting
- **Max Attempts**: 10 operations
- **Time Window**: 1 minute
- **Block Duration**: 5 minutes after exceeding limit
- **Applies To**: 
  - `pushSettings()` - Full settings sync
  - `pushWebSettings()` - Web-specific settings sync
- **User Feedback**: Toast notification when rate limited

## Implementation Details

### Rate Limiter Class (`src/core/rateLimiter.ts`)
- Singleton pattern for global rate limiting
- In-memory storage of attempt records
- Automatic cleanup of expired records every 5 minutes
- Configurable per operation type

### Key Methods
- `isAllowed(operation, identifier)` - Check if operation is allowed
- `recordAttempt(operation, identifier)` - Record a failed attempt
- `reset(operation, identifier)` - Reset attempts (on success)
- `getRemainingAttempts(operation, identifier)` - Get remaining attempts
- `getStats()` - Get monitoring statistics

### Integration Points
1. **Login Form** (`src/renderer/auth.ts`)
   - Checks rate limit before attempting login
   - Records failed attempts
   - Resets on successful login
   - Shows remaining attempts in error message

2. **Verification Form** (`src/renderer/auth.ts`)
   - Checks rate limit before verification
   - Records failed attempts
   - Resets on successful verification
   - Shows remaining attempts in error message

3. **Sync Operations** (`src/renderer/ui.ts`)
   - Checks rate limit before sync
   - Records each sync attempt
   - Prevents sync spam

## Security Benefits
1. **Brute Force Protection**: Limits password guessing attempts
2. **Account Enumeration Prevention**: Makes it harder to discover valid usernames
3. **Resource Protection**: Prevents abuse of sync operations
4. **DoS Mitigation**: Prevents overwhelming the backend with requests

## User Experience
- Clear error messages with time remaining
- Attempt counter when approaching limit
- Automatic reset after successful operations
- No impact on legitimate users

## Monitoring
The rate limiter provides statistics through `getStats()` method for monitoring:
- Active rate limit records
- Blocked users/operations
- Attempt counts per operation

## Future Enhancements
- Persistent storage (localStorage) for rate limits across sessions
- IP-based rate limiting (requires backend support)
- Progressive delays (exponential backoff)
- Admin dashboard for monitoring
- Configurable limits per user tier
