const sharp = require('sharp');
const { imageMatches } = require('./request-security.cjs');
const formats = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

// Call after authentication and quota checks. Decode pixels, then discard all
// original bytes/metadata before sending the normalized image to the provider.
async function normalizeReceiptImage(base64Data, mediaType) {
  if (!imageMatches(base64Data, mediaType)) throw Error('invalid_image');
  const input = Buffer.from(base64Data, 'base64');
  const pipeline = sharp(input, { failOn: 'warning', limitInputPixels: 16000000, sequentialRead: true });
  try {
    const meta = await pipeline.metadata();
    if (meta.format !== formats[mediaType] || (meta.pages || 1) !== 1 || !meta.width || !meta.height) throw Error('invalid_image');
    const output = await pipeline.rotate().resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }).jpeg({ quality: 90 }).timeout({ seconds: 5 }).toBuffer();
    if (output.length > 3 * 1024 * 1024) throw Error('image_too_large');
    return { base64Data: output.toString('base64'), mediaType: 'image/jpeg' };
  } finally { pipeline.destroy(); }
}
module.exports = { normalizeReceiptImage };
