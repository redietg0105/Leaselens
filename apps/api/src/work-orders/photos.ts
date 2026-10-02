import { BadRequestException } from '@nestjs/common';
import { detectImageType, PHOTO_ERRORS, photoProblem, type PhotoType } from '@leaselens/shared';
import sharp from 'sharp';

/** Refuse images bigger than ~40 megapixels (decompression bombs). */
const MAX_INPUT_PIXELS = 40_000_000;
/** Long edge after processing. Plenty for a repair photo; keeps storage small. */
const MAX_EDGE = 2560;

export interface ProcessedPhoto {
  data: Buffer;
  contentType: PhotoType;
}

/**
 * Checks a photo by its content (not its name or claimed type), turns it upright using the EXIF
 * orientation, then re-encodes it. Re-encoding drops all metadata (GPS location, device details)
 * and proves the file really is an image.
 */
export async function processPhoto(buffer: Buffer): Promise<ProcessedPhoto> {
  const problem = photoProblem(buffer.length, buffer.subarray(0, 12));
  if (problem) throw new BadRequestException(problem);
  const contentType = detectImageType(buffer)!;

  try {
    // rotate() with no angle = apply EXIF orientation. sharp writes no metadata unless asked.
    const pipeline = sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true });
    const data =
      contentType === 'image/png'
        ? await pipeline.png().toBuffer()
        : contentType === 'image/webp'
          ? await pipeline.webp({ quality: 85 }).toBuffer()
          : await pipeline.jpeg({ quality: 85 }).toBuffer();
    return { data, contentType };
  } catch {
    throw new BadRequestException(PHOTO_ERRORS.badType);
  }
}
