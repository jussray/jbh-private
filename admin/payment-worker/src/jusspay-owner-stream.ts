// Hard cap on private upstream order data. A malicious or malformed response
// must not make the owner Worker buffer arbitrary customer data.
export const MAX_QUEUE_RESPONSE_BYTES = 1024 * 1024;

export async function readLimitedResponse(response: Response): Promise<string> {
  if (!response.body) throw new Error("missing_upstream_body");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const {done, value} = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_QUEUE_RESPONSE_BYTES) {
      await reader.cancel().catch(() => {});
      throw new Error("upstream_body_too_large");
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {buffer.set(chunk, offset);offset += chunk.byteLength;}
  return new TextDecoder("utf-8", {fatal: true}).decode(buffer);
}
