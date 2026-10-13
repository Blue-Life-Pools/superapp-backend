import { allocateConsumption, ConsumptionBody, distributeInteger } from './consumption-allocation';
const body = (id: string, gallons: number | null, type = 'SWIMMING_POOL', size = 'MEDIUM'): ConsumptionBody => ({ id, name: id, gallons, type, size, active: true });
describe('chemical consumption allocation', () => {
  it('assigns Ascott by volume and preserves $1600 to the cent', () => {
    const result = allocateConsumption([body('Front', 37000), body('Office', 48000), body('Back', 37000)], 1600, 315.38);
    expect(result.basis).toBe('GALLONS');
    expect(result.bodies.map((item) => item.monthlyFee)).toEqual([485.25, 629.51, 485.24]);
    expect(result.bodies.map((item) => item.chemicalCost)).toEqual([95.65, 124.08, 95.65]);
    expect(result.unallocatedFee).toBe(0);
  });
  it('caps each spa at $250 and redistributes the remaining contract', () => {
    const result = allocateConsumption([body('Pool', 10000), body('Spa', 10000, 'SPA')], 1600, 100);
    expect(result.bodies.map((item) => item.monthlyFee)).toEqual([1350, 250]);
  });
  it('reports unassignable revenue instead of exceeding spa caps', () => {
    const result = allocateConsumption([body('Spa', 1000, 'SPA')], 1000, 50);
    expect(result.bodies[0].monthlyFee).toBe(250);
    expect(result.unallocatedFee).toBe(750);
  });
  it('uses commercial sizes when any volume is missing', () => {
    const result = allocateConsumption([body('Small', 10000, 'SWIMMING_POOL', 'SMALL'), body('Large', null, 'SWIMMING_POOL', 'LARGE')], 1500, 150);
    expect(result.basis).toBe('COMMERCIAL_SIZE');
    expect(result.bodies.map((item) => item.monthlyFee)).toEqual([600, 900]);
  });
  it('leaves the total visible when no active bodies exist', () => {
    const result = allocateConsumption([], 1600, 315.38);
    expect(result.unallocatedFee).toBe(1600);
    expect(result.unallocatedCost).toBe(315.38);
  });
  it('preserves quantities using four decimal places', () => {
    expect(distributeInteger(1362500, [37000, 48000, 37000]).reduce((a, b) => a + b, 0)).toBe(1362500);
  });
});
