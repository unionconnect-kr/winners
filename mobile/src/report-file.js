// Chunking avoids overflowing the JS argument stack for Korean-font PDFs.
export function reportBytesToBase64(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (!data.byteLength || data.byteLength > 32 * 1024 * 1024) throw new Error('Invalid report size');
  let binary = '';
  for (let offset = 0; offset < data.length; offset += 8192) {
    binary += String.fromCharCode(...data.subarray(offset, offset + 8192));
  }
  return btoa(binary);
}
