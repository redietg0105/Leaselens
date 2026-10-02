import type { Role } from '@prisma/client';

/** The signed-in user, loaded from the database by SessionGuard. */
export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  unitId: string | null;
  vendorId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
  }
}
