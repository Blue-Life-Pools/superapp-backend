export const APP_ROLES = ['COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS', 'SUPER_ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const IS_PUBLIC_KEY = 'isPublic';
export const APP_ROLES_KEY = 'appRoles';

export function allowedAreas(role: AppRole) {
  if (role === 'SUPER_ADMIN') {
    return ['home', 'commercial', 'chemicals', 'health', 'reports'] as const;
  }
  return ['home', role.toLowerCase()] as const;
}
