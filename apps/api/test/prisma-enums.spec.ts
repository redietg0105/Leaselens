import { $Enums } from '@prisma/client';
import {
  CategorySchema,
  EntryPermissionSchema,
  RoleSchema,
  UrgencySchema,
  WorkOrderStatusSchema,
} from '@leaselens/shared';

// The database enums and the shared Zod enums must never drift apart.
describe('Prisma enums match packages/shared', () => {
  it.each([
    ['Role', $Enums.Role, RoleSchema.options],
    ['Urgency', $Enums.Urgency, UrgencySchema.options],
    ['Category', $Enums.Category, CategorySchema.options],
    ['WorkOrderStatus', $Enums.WorkOrderStatus, WorkOrderStatusSchema.options],
    ['EntryPermission', $Enums.EntryPermission, EntryPermissionSchema.options],
  ])('%s', (_name, prismaEnum, zodOptions) => {
    expect(Object.values(prismaEnum).sort()).toEqual([...zodOptions].sort());
  });
});
