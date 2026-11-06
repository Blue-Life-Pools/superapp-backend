import { matchConsumptionProperties } from './consumption-property-matching';

describe('Consumption property locations', () => {
  const properties = [
    { id: 'belmont-3540', name: 'BELMONT HEIGHTS 1028', code: 'NOQ717E8N9Z7', addressLine1: '3540 N 20th st', city: 'Tampa', state: 'FL' },
    { id: 'belmont-2419', name: 'BELMONT HEIGHTS 1032', code: 'YCO895P5G3L8', addressLine1: '2419 E 31st Ave', city: 'Tampa', state: 'FL' },
    { id: 'claudia-sean', name: 'CLAUDIA TIBATUZO - SEAN', code: 'BAS059A3D1C8', addressLine1: '11016 Sean Rd 33625', city: 'Tampa', state: 'FL' },
    { id: 'claudia-hutchison', name: 'CLAUDIA TIBATUZO - HUTCHISON', code: 'PDL195N8J5Q6', addressLine1: '15318 Hutchison Rd', city: 'Tampa', state: 'FL' },
  ];
  it('keeps separate addresses under a combined source code assigned to the right Home property', () => {
    const code = 'NOQ717E8N9Z7 - YCO895P5G3L8';
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT HEIGHTS PHASE 1 and 2', code, addressLine1: '2419 E 31ST AVENUE' }).map(p => p.id)).toEqual(['belmont-2419']);
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT HEIGHTS PHASE 1 and 2', code, addressLine1: '3540 N 20th St Tampa' }).map(p => p.id)).toEqual(['belmont-3540']);
  });
  it('matches a combined customer code by service address even when Home appends a ZIP code', () => {
    expect(matchConsumptionProperties(properties, { propertyName: 'CLAUDIA TIBATUZO', code: 'PDL195N8J5Q6 - BAS059A3D1C8', addressLine1: '11016 Sean Rd' }).map(p => p.id)).toEqual(['claudia-sean']);
  });
  it('does not guess when a combined code lacks an address or supplies an unknown address', () => {
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT', code: 'NOQ717E8N9Z7 - YCO895P5G3L8' })).toHaveLength(2);
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT', code: 'NOQ717E8N9Z7 - YCO895P5G3L8', addressLine1: '999 Unknown St' })).toEqual([]);
  });
  it('preserves distinct house numbers and unit numbers', () => {
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT', addressLine1: '3541 N 20th St' })).toEqual([]);
    expect(matchConsumptionProperties(properties, { propertyName: 'BELMONT', addressLine1: '3540 N 20th St Unit 2' })).toEqual([]);
  });
  it('preserves the established exact name match for coded exports whose external code is absent in Home', () => {
    const home = [{ id: 'existing', name: 'Clearview', code: null, addressLine1: 'Existing address metadata' }];
    expect(matchConsumptionProperties(home, { propertyName: 'Clearview .', code: 'E19DB356-890', addressLine1: '101 Main Street N' }).map(p => p.id)).toEqual(['existing']);
    expect(matchConsumptionProperties(home, { propertyName: 'Clearview', addressLine1: '101 Main Street N' })).toEqual([]);
  });
  it('uses the user-confirmed NV source alias only for the confirmed customer and address', () => {
    const nv = [
      { id: '4623', name: 'NV PROPERTY 4623', code: '8A5BA0E7-B17', addressLine1: '4623 W Browning Ave' },
      { id: 'old-10380', name: 'NV PROPERTY 10380', code: '36AC6952-4CD', addressLine1: '4623 W Browning Ave' },
    ];
    expect(matchConsumptionProperties(nv, { propertyName: 'NV PROPERTY HOLDINGS', addressLine1: '4623 w Browning avenue' }).map(p => p.id)).toEqual(['4623']);
    expect(matchConsumptionProperties(nv, { propertyName: 'Another customer', addressLine1: '4623 W Browning Ave' })).toHaveLength(2);
  });
});
