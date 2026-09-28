import { SetMetadata } from '@nestjs/common';
import { APP_ROLES_KEY, AppRole, IS_PUBLIC_KEY } from './auth.constants';

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
export const Roles = (...roles: AppRole[]) => SetMetadata(APP_ROLES_KEY, roles);
