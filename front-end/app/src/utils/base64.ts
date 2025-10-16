// Base64 Processing Utilities
// Handles base64 encoding/decoding and conversion to blob URLs

import type { InlineData } from '@/app/src/types/agent'

/**
 * Custom error for base64 processing failures
 */
export class Base64ProcessingError extends Error {
  constructor(message: string, public readonly originalError?: Error) {
    super(message)
    this.name = 'Base64ProcessingError'
  }
}

/**
 * Process base64 image data and convert to blob URL
 * Handles Base64URL encoding, URL encoding, and validation
 * 
 * @param inlineData - Inline data from ADK response
 * @returns Blob URL or null if processing fails
 */
export function processBase64Image(inlineData: InlineData): string | null {
  try {
    // Step 1: Clean whitespace
    let base64Data = inlineData.data.replace(/\s/g, '')
    
    // Step 2: Convert Base64URL to standard base64 if needed
    // Base64URL uses - and _ instead of + and /
    if (base64Data.includes('-') || base64Data.includes('_')) {
      console.log('🔧 Converting Base64URL to standard base64...')
      
      base64Data = base64Data
        .replace(/-/g, '+')  // Replace - with +
        .replace(/_/g, '/')  // Replace _ with /
      
      // Add padding if needed (Base64URL often omits padding)
      const padding = base64Data.length % 4
      if (padding !== 0) {
        base64Data += '='.repeat(4 - padding)
      }
      
      console.log('✅ Base64URL conversion complete')
    }
    
    // Step 3: Decode URL encoding if present
    if (base64Data.includes('%')) {
      console.log('🔧 Decoding URL-encoded base64...')
      try {
        base64Data = decodeURIComponent(base64Data)
        console.log('✅ URL decoding complete')
      } catch (urlDecodeError) {
        console.warn('⚠️ URL decoding failed, continuing with original data:', urlDecodeError)
      }
    }
    
    // Step 4: Validate base64 format
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    if (!base64Regex.test(base64Data)) {
      // Find invalid characters for debugging
      const invalidChars = base64Data.match(/[^A-Za-z0-9+/=]/g)
      throw new Base64ProcessingError(
        `Invalid base64 format. Found invalid characters: ${invalidChars?.slice(0, 5).join(', ')}`
      )
    }
    
    // Step 5: Convert to Blob URL (more reliable than data URLs for large images)
    const byteCharacters = atob(base64Data)
    const byteArray = new Uint8Array(
      Array.from(byteCharacters).map(char => char.charCodeAt(0))
    )
    const blob = new Blob([byteArray], { type: inlineData.mimeType })
    const blobUrl = URL.createObjectURL(blob)
    
    console.log(`✅ Created blob URL for ${inlineData.mimeType}, size: ${byteArray.length} bytes`)
    
    return blobUrl
    
  } catch (error) {
    console.error('❌ Failed to process base64 image:', error)
    
    // Fallback: Try data URL (works for smaller images)
    try {
      console.log('⚠️ Attempting data URL fallback...')
      return `data:${inlineData.mimeType};base64,${inlineData.data}`
    } catch (fallbackError) {
      console.error('❌ Data URL fallback also failed:', fallbackError)
      return null
    }
  }
}

/**
 * Cleanup blob URLs to prevent memory leaks
 * Should be called when the blob URL is no longer needed
 * 
 * @param url - Blob URL to revoke
 */
export function revokeBlobUrl(url: string): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url)
      console.log('🧹 Revoked blob URL')
    } catch (error) {
      console.warn('⚠️ Failed to revoke blob URL:', error)
    }
  }
}

/**
 * Cleanup multiple blob URLs
 * 
 * @param urls - Array of blob URLs to revoke
 */
export function revokeBlobUrls(urls: string[]): void {
  urls.forEach(revokeBlobUrl)
}

/**
 * Validate if a string is valid base64
 * 
 * @param str - String to validate
 * @returns True if valid base64
 */
export function isValidBase64(str: string): boolean {
  try {
    // Clean and validate
    const cleaned = str.replace(/\s/g, '')
    const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/
    
    if (!base64Regex.test(cleaned)) {
      return false
    }
    
    // Try to decode
    atob(cleaned)
    return true
  } catch {
    return false
  }
}

/**
 * Get size of base64 encoded data in bytes
 * 
 * @param base64String - Base64 encoded string
 * @returns Size in bytes
 */
export function getBase64Size(base64String: string): number {
  const cleaned = base64String.replace(/\s/g, '')
  const padding = (cleaned.match(/=/g) || []).length
  return Math.floor((cleaned.length * 3) / 4) - padding
}
