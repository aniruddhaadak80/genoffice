/** build a fake SSE response body from raw lines (each already includes "data: " if needed).
 *  Each entry is one event, terminated by the blank line the spec dispatches on. */
export function sseStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n\n`))
      controller.close()
    },
  })
}

export function okResponse(body: ReadableStream<Uint8Array>): Response {
  return new Response(body, { status: 200 })
}

export function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

export function errorResponse(status: number, text: string): Response {
  return new Response(text, { status })
}
