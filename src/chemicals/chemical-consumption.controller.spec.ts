import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { APP_ROLES_KEY } from '../auth/auth.constants';
import { ChemicalConsumptionController } from './chemical-consumption.controller';

describe('Home chemical consumption access', () => {
  const reflector = new Reflector();
  const controller = ChemicalConsumptionController;
  it('permits authenticated Home roles to read the monthly report', () => {
    const roles = reflector.getAllAndOverride(APP_ROLES_KEY, [controller.prototype.list, controller]);
    expect(roles).toEqual(expect.arrayContaining(['COMMERCIAL', 'CHEMICALS', 'HEALTH', 'REPORTS', 'QUALITY']));
  });
  it('keeps import and update restricted to the Chemicals role', () => {
    for (const method of ['preview', 'import', 'update'] as const) {
      expect(reflector.getAllAndOverride(APP_ROLES_KEY, [controller.prototype[method], controller])).toEqual(['CHEMICALS']);
    }
  });
});
