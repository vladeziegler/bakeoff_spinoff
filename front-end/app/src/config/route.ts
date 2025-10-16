// API Configuration
// Centralized configuration for ADK API communication

/**
 * API Configuration object
 * Uses environment variables with sensible defaults
 */
export const API_CONFIG = {
  // Base URL for ADK Web Server (via Next.js proxy)
  baseUrl: process.env.NEXT_PUBLIC_API_URL || '/api',
  
  // Application name in ADK
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'banking_agent',
  
  // Request timeout in milliseconds
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000', 10),
  
  // Number of retry attempts for failed requests
  retryAttempts: parseInt(process.env.NEXT_PUBLIC_API_RETRY_ATTEMPTS || '3', 10),
  
  // Enable debug logging
  debug: process.env.NEXT_PUBLIC_API_DEBUG === 'true',
} as const

/**
 * Get full API URL for a given endpoint
 * @param endpoint - API endpoint path (e.g., '/apps/banking_agent/users/user/sessions')
 * @returns Full URL
 */
export function getApiUrl(endpoint: string): string {
  // Ensure endpoint starts with /
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`
  return `${API_CONFIG.baseUrl}${normalizedEndpoint}`
}

/**
 * Log debug information if debug mode is enabled
 * @param message - Debug message
 * @param data - Optional data to log
 */
export function debugLog(message: string, data?: any): void {
  if (API_CONFIG.debug) {
    if (data !== undefined) {
      console.log(`[API Debug] ${message}`, data)
    } else {
      console.log(`[API Debug] ${message}`)
    }
  }
}
