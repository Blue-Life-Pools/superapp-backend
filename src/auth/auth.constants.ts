export const APP_ROLES = ['COMMERCIAL', 'CHEMICALS', 'REPORTS'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const IS_PUBLIC_KEY = 'isPublic';
export const APP_ROLES_KEY = 'appRoles';

export function allowedAreas(role: AppRole) {
  return ['home', role.toLowerCase()] as const;
}
