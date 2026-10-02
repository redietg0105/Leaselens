/**
 * The shared rules used by both the browser form and the API.
 */
import {
  ACCESS_NOTES_MAX,
  CreateWorkOrderSchema,
  DESCRIPTION_MAX,
  DESCRIPTION_MIN,
  detectImageType,
  MAX_PHOTO_BYTES,
  PHOTO_ERRORS,
  photoProblem,
} from '@leaselens/shared';
import { gif, phoneJpeg, png, textPretendingToBeJpeg, webp } from './support/images';

const valid = { description: 'Kitchen sink is leaking under the cabinet', entryPermission: 'CALL_FIRST' };
const parse = (overrides: Record<string, unknown>) => CreateWorkOrderSchema.safeParse({ ...valid, ...overrides });
const firstError = (overrides: Record<string, unknown>) => {
  const r = parse(overrides);
  return r.success ? null : r.error.issues[0].message;
};

describe('CreateWorkOrderSchema', () => {
  it('accepts a valid request', () => {
    expect(parse({}).success).toBe(true);
  });

  it(`requires at least ${DESCRIPTION_MIN} characters, after trimming spaces`, () => {
    expect(parse({ description: 'x'.repeat(DESCRIPTION_MIN) }).success).toBe(true);
    expect(firstError({ description: 'x'.repeat(DESCRIPTION_MIN - 1) })).toMatch(/at least 10/);
    expect(firstError({ description: `   ${'x'.repeat(DESCRIPTION_MIN - 1)}   ` })).toMatch(/at least 10/);
  });

  it(`allows at most ${DESCRIPTION_MAX} characters`, () => {
    expect(parse({ description: 'x'.repeat(DESCRIPTION_MAX) }).success).toBe(true);
    expect(firstError({ description: 'x'.repeat(DESCRIPTION_MAX + 1) })).toMatch(/under 1000/);
  });

  it('requires a description', () => {
    expect(parse({ description: undefined }).success).toBe(false);
  });

  it.each(['YES', 'NO', 'CALL_FIRST'])('accepts entry permission %s', (entryPermission) => {
    expect(parse({ entryPermission }).success).toBe(true);
  });

  it('rejects a missing or unknown entry permission with a clear message', () => {
    expect(firstError({ entryPermission: undefined })).toBe('Choose whether we may enter.');
    expect(firstError({ entryPermission: 'MAYBE' })).toBe('Choose whether we may enter.');
  });

  it(`limits access notes to ${ACCESS_NOTES_MAX} characters and treats blank as none`, () => {
    expect(parse({ accessNotes: 'x'.repeat(ACCESS_NOTES_MAX) }).success).toBe(true);
    expect(firstError({ accessNotes: 'x'.repeat(ACCESS_NOTES_MAX + 1) })).toMatch(/500 characters/);
    const blank = parse({ accessNotes: '   ' });
    expect(blank.success && blank.data.accessNotes).toBeUndefined();
  });

  it('drops fields it does not know, such as unitId', () => {
    const r = parse({ unitId: 'someone-elses-unit', status: 'COMPLETED' });
    expect(r.success && r.data).toEqual({ description: valid.description, entryPermission: 'CALL_FIRST' });
  });
});

describe('detectImageType (by content, not name)', () => {
  it('recognises real JPEG, PNG and WebP files', async () => {
    expect(detectImageType(await phoneJpeg())).toBe('image/jpeg');
    expect(detectImageType(await png())).toBe('image/png');
    expect(detectImageType(await webp())).toBe('image/webp');
  });

  it('rejects GIF, text and PDF files even if they are named .jpg', async () => {
    expect(detectImageType(await gif())).toBeNull();
    expect(detectImageType(textPretendingToBeJpeg())).toBeNull();
    expect(detectImageType(Buffer.from('%PDF-1.7\n'))).toBeNull();
    expect(detectImageType(new Uint8Array())).toBeNull();
  });
});

describe('photoProblem', () => {
  it('allows exactly 5 MB and rejects anything larger', async () => {
    const jpegStart = (await phoneJpeg()).subarray(0, 12);
    expect(photoProblem(MAX_PHOTO_BYTES, jpegStart)).toBeNull();
    expect(photoProblem(MAX_PHOTO_BYTES + 1, jpegStart)).toBe(PHOTO_ERRORS.tooLarge);
  });

  it('rejects the wrong type', () => {
    expect(photoProblem(100, textPretendingToBeJpeg())).toBe(PHOTO_ERRORS.badType);
  });
});

describe('safeReturnPath (where /unavailable sends the user back to)', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { safeReturnPath } = require('@leaselens/shared') as typeof import('@leaselens/shared');
  it.each(['/tenant', '/tenant/requests/abc?created=1', '/staff'])('keeps same-site path %s', (p) => {
    expect(safeReturnPath(p)).toBe(p);
  });
  it.each([
    'https://evil.example',
    '//evil.example',
    '/\\evil.example',
    'javascript:alert(1)',
    'tenant',
    '',
    '/tenant\nSet-Cookie: x',
    undefined,
    ['/tenant'],
    '/' + 'a'.repeat(600),
  ])('rejects %p', (p) => {
    expect(safeReturnPath(p, '/')).toBe('/');
  });
});
