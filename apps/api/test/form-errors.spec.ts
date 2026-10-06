/**
 * Regression B-10: a field error stayed on screen after the value was fixed ("at least 10 characters" on
 * the New request form, and the same in the other forms). The web forms re-check a field that shows an
 * error with these shared helpers on every change; they are tested here because the web app has no unit
 * test runner (the browser test e2e/form-errors.spec.ts drives the real form).
 */
import {
  checkOverrideForm,
  CompleteJobSchema,
  CreateWorkOrderSchema,
  fieldErrors,
  refreshShownErrors,
  RequestLinkSchema,
  type OverrideFormValues,
} from '@leaselens/shared';

type RequestFields = 'description' | 'entryPermission' | 'accessNotes' | 'photos';
const FIELDS = ['description', 'accessNotes'] as const;

describe('field errors clear as soon as the value is valid', () => {
  it('New request: "at least 10 characters" goes away once the description is long enough', () => {
    const shown = fieldErrors(CreateWorkOrderSchema, { description: 'leak', entryPermission: 'YES' });
    expect(shown.description).toMatch(/at least 10 characters/);

    const stillShort = refreshShownErrors<RequestFields>(shown, CreateWorkOrderSchema, { description: 'leak und', entryPermission: 'YES' }, FIELDS);
    expect(stillShort.description).toMatch(/at least 10 characters/);

    const fixed = refreshShownErrors<RequestFields>(stillShort, CreateWorkOrderSchema, { description: 'leak under the sink', entryPermission: 'YES' }, FIELDS);
    expect(fixed.description).toBeUndefined();
    expect('description' in fixed).toBe(false); // so the field is no longer aria-invalid
  });

  it('access notes: the "too long" error goes once the notes are short enough', () => {
    const values = (accessNotes: string) => ({ description: 'Kitchen sink leaks', entryPermission: 'YES', accessNotes });
    const shown = fieldErrors(CreateWorkOrderSchema, values('x'.repeat(501)));
    expect(shown.accessNotes).toBeDefined();
    expect(refreshShownErrors<RequestFields>(shown, CreateWorkOrderSchema, values('x'.repeat(500)), FIELDS).accessNotes).toBeUndefined();
  });

  it('only fields that already show an error are updated — typing never shows a new error early', () => {
    // The description error is showing; the access notes become too long while typing, but weren't submitted yet.
    const shown: Partial<Record<RequestFields, string>> = { description: 'Please describe the problem in at least 10 characters.' };
    const next = refreshShownErrors<RequestFields>(shown, CreateWorkOrderSchema, { description: 'short', entryPermission: 'YES', accessNotes: 'x'.repeat(600) }, FIELDS);
    expect(next.accessNotes).toBeUndefined();
    expect(next.description).toBeDefined();
  });

  it('keeps errors the schema does not check (photos) and fields it was not asked to refresh', () => {
    const shown: Partial<Record<RequestFields, string>> = { photos: 'You can add up to 3 photos.', entryPermission: 'Choose whether we may enter.' };
    const next = refreshShownErrors<RequestFields>(shown, CreateWorkOrderSchema, { description: 'Kitchen sink leaks', entryPermission: 'YES' }, FIELDS);
    expect(next).toEqual(shown);
  });

  it('sign-in: the email error clears once the address is valid', () => {
    const shown = { email: 'Enter a valid email address.' };
    expect(refreshShownErrors(shown, RequestLinkSchema, { email: 'tenant@leaselens' }, ['email']).email).toBeDefined();
    expect(refreshShownErrors(shown, RequestLinkSchema, { email: 'tenant@leaselens.test' }, ['email']).email).toBeUndefined();
  });

  it('vendor completion note: the error clears once a note is written', () => {
    const shown = fieldErrors(CompleteJobSchema, { note: '' });
    expect(shown.note).toBeDefined();
    expect(refreshShownErrors(shown, CompleteJobSchema, { note: 'Replaced the washer.' }, ['note']).note).toBeUndefined();
  });
});

describe('staff override form check (used on Submit and again while editing)', () => {
  const base: OverrideFormValues = { category: 'PLUMBING', urgency: 'ROUTINE', newCategory: 'PLUMBING', newUrgency: 'ROUTINE', reason: '', confirmLower: false };

  it('a short reason is a reason error; a long enough one clears it', () => {
    const short = checkOverrideForm({ ...base, newUrgency: 'URGENT', reason: 'too short' });
    expect(short).toEqual({ ok: false, field: 'reason', message: 'Give a reason of at least 10 characters.' });
    expect(checkOverrideForm({ ...base, newUrgency: 'URGENT', reason: 'Tenant has a newborn at home' }).ok).toBe(true);
  });

  it('"nothing changed" belongs to the category; changing a value clears it', () => {
    const same = checkOverrideForm({ ...base, reason: 'Checked by phone with the tenant' });
    expect(same).toEqual({ ok: false, field: 'category', message: 'Change the category or the urgency.' });
    expect(checkOverrideForm({ ...base, newCategory: 'APPLIANCE', reason: 'Checked by phone with the tenant' }).ok).toBe(true);
  });

  it('lowering an emergency: the longer reason, then the confirmation box, each clear when fixed', () => {
    const emergency = { ...base, urgency: 'EMERGENCY' as const, newUrgency: 'URGENT' as const };
    expect(checkOverrideForm({ ...emergency, reason: 'Inspected, safe now' })).toMatchObject({ ok: false, field: 'reason' });
    expect(checkOverrideForm({ ...emergency, reason: 'Inspected: no gas, the stove knob was off' })).toMatchObject({ ok: false, field: 'confirm' });
    expect(checkOverrideForm({ ...emergency, reason: 'Inspected: no gas, the stove knob was off', confirmLower: true })).toMatchObject({
      ok: true,
      data: { urgency: 'URGENT', confirmLowerEmergency: true },
    });
  });
});
