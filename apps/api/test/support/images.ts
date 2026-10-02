import sharp from 'sharp';

const base = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 40 } } });

/**
 * A JPEG like a phone camera makes: stored sideways with EXIF orientation 6 ("rotate 90° to view")
 * and GPS location + device details in its metadata.
 */
export async function phoneJpeg(width = 40, height = 20): Promise<Buffer> {
  return base(width, height)
    .jpeg()
    .withMetadata({ orientation: 6 })
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'TP-1' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '38/1 54/1 0/1', GPSLongitudeRef: 'W', GPSLongitude: '77/1 2/1 0/1' },
    })
    .toBuffer();
}

export const png = () => base(8, 8).png().toBuffer();
export const webp = () => base(8, 8).webp().toBuffer();
export const gif = () => base(8, 8).gif().toBuffer();

/** Plain text pretending to be a photo. */
export const textPretendingToBeJpeg = () => Buffer.from('this is not really a photo at all');

/** Starts like a JPEG but the rest is garbage, so it can't be decoded. */
export const brokenJpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 7)]);

/** Just over the 5 MB limit. */
export const oversized = () => {
  const b = Buffer.alloc(5 * 1024 * 1024 + 1, 0);
  b.set([0xff, 0xd8, 0xff], 0);
  return b;
};
