import { maxPhotoBytes } from './report';

export function cleanPhoto(bytes: Uint8Array): Uint8Array {
  if (
    bytes.length > maxPhotoBytes ||
    bytes.length < 20 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8
  )
    throw new Error('Attach a JPEG photo no larger than 256 KB.');
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;
  let dimensions = false;
  let scan = false;
  let ended = false;
  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset++] !== 0xff) throw new Error('The JPEG photo is damaged.');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9) {
      if (offset !== bytes.length || !dimensions || !scan)
        throw new Error('The JPEG photo is incomplete.');
      parts.push(bytes.slice(start, offset));
      ended = true;
      break;
    }
    if (marker === undefined || offset + 2 > bytes.length)
      throw new Error('The JPEG photo is incomplete.');
    const length = (bytes[offset] << 8) | bytes[offset + 1];
    if (length < 2 || offset + length > bytes.length)
      throw new Error('The JPEG photo has an invalid segment.');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      if (
        dimensions ||
        length < 11 ||
        width < 1 ||
        height < 1 ||
        width > 2048 ||
        height > 2048
      )
        throw new Error('The photo dimensions must be at most 2048 × 2048.');
      dimensions = true;
    }
    offset += length;
    if (marker === 0xda) {
      if (!dimensions) throw new Error('The JPEG photo has no dimensions.');
      scan = true;
      while (offset < bytes.length) {
        if (bytes[offset] === 0xff) {
          let next = offset + 1;
          while (bytes[next] === 0xff) next++;
          if (
            bytes[next] !== 0 &&
            !(bytes[next] >= 0xd0 && bytes[next] <= 0xd7)
          )
            break;
          offset = next + 1;
        } else offset++;
      }
    }
    // Drop EXIF, location, comments and other application metadata, even between scans.
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe)
      parts.push(bytes.slice(start, offset));
  }
  if (!ended) throw new Error('The JPEG photo has no end marker.');
  const result = new Uint8Array(
    parts.reduce((size, part) => size + part.length, 0),
  );
  let index = 0;
  for (const part of parts) {
    result.set(part, index);
    index += part.length;
  }
  return result;
}
