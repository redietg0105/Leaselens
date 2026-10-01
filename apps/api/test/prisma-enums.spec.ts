import { $Enums } from '@prisma/client';
import { CategorySchema, RoleSchema, UrgencySchema } from '@leaselens/shared';

// The database enums and the shared Zod enums must never drift apart.
describe('Prisma enums match packages/shared', () => {
  it.each([
    ['Role', $Enums.Role, RoleSchema.options],
    ['Urgency', $Enums.Urgency, UrgencySchema.options],
    ['Category', $Enums.Category, CategorySchema.options],
  ])('%s', (_name, prismaEnum, zodOptions) => {
    expect(Object.values(prismaEnum).sort()).toEqual([...zodOptions].sort());
  });
});
