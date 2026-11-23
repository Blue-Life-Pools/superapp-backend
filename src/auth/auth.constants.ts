export const APP_ROLES = ['COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS', 'QUALITY', 'OPERATIONS_DIRECTOR', 'SUPER_ADMIN'] as const;
export type AppRole = (typeof APP_ROLES)[number];

export const IS_PUBLIC_KEY = 'isPublic';
export const APP_ROLES_KEY = 'appRoles';

export function allowedAreas(role: AppRole) {
  if (role === 'SUPER_ADMIN' || role === 'OPERATIONS_DIRECTOR') {
    return ['home', 'commercial', 'opportunities', 'chemicals', 'health', 'reports', 'gasoline', 'complaints', 'quality'] as const;
  }
  if (role === 'QUALITY') {
    return ['home', 'gasoline', 'quality'] as const;
  }
  if (role === 'REPORTS') {
    return ['home', 'opportunities', 'reports', 'gasoline', 'quality'] as const;
  }
  if (role === 'COMMERCIAL') return ['home', 'commercial', 'opportunities', 'gasoline'] as const;
  if (role === 'CHEMICALS') return ['home', 'commercial', 'chemicals', 'gasoline'] as const;
  return ['home', role.toLowerCase(), 'gasoline'] as const;
}
