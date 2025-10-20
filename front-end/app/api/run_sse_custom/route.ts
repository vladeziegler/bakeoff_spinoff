/**
 * Custom SSE API Route - Proper Streaming Proxy
 * Proxies SSE requests to ADK without buffering
 * Uses edge runtime to avoid Next.js buffering issues
 */

import { NextRequest } from 'next/server'

// USE EDGE RUNTIME - This is critical to avoid buffering!
export const runtime = 'edge'

// Maximum execution duration
export const maxDuration = 300

/**
 * CORS headers for SSE
 */
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  'Connection': 'keep-alive',
  'X-Accel-Buffering': 'no', // Disable nginx buffering
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

/**
 * Handle OPTIONS for CORS preflight
 */
export async function OPTIONS() {
  return new Response(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}

/**
 * Main POST handler - Properly proxies SSE stream from ADK
 */
export async function POST(request: NextRequest) {
  console.log('[CUSTOM SSE] Incoming streaming request')

  try {
    // Parse request body
    const body = await request.json()
    const { appName, userId, sessionId, newMessage, streaming, stateDelta } = body

    console.log('[CUSTOM SSE] Request params:', {
      appName,
      userId,
      sessionId,
    })

    // Validate required fields
    if (!appName || !userId || !sessionId || !newMessage) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Forward to ADK's SSE endpoint
    const adkUrl = `http://localhost:8000/run_sse`

    const adkPayload = {
      appName,
      userId,
      sessionId,
      newMessage,
      streaming: true,  // Enable streaming
      stateDelta: stateDelta || null,
    }

    console.log('[CUSTOM SSE] Forwarding to ADK SSE:', adkUrl)

    // Forward request to ADK
    const adkResponse = await fetch(adkUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(adkPayload),
    })

    if (!adkResponse.ok) {
      console.error('[CUSTOM SSE] ADK error:', adkResponse.status, adkResponse.statusText)
      const errorText = await adkResponse.text()
      return new Response(
        JSON.stringify({ 
          error: `ADK error: ${adkResponse.status} ${adkResponse.statusText}`,
          details: errorText
        }),
        { status: adkResponse.status, headers: { 'Content-Type': 'application/json' } }
      )
    }

    if (!adkResponse.body) {
      console.error('[CUSTOM SSE] No response body from ADK')
      return new Response(
        JSON.stringify({ error: 'No response body from ADK' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      )
    }

    console.log('[CUSTOM SSE] Proxying SSE stream from ADK (edge runtime = no buffering)')

    // Simply return the ADK response body - edge runtime won't buffer!
    return new Response(adkResponse.body, {
      headers: SSE_HEADERS,
    })

  } catch (error) {
    console.error('[CUSTOM SSE] Handler error:', error)
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
