import { Test, TestingModule } from '@nestjs/testing';
import { PropertiesController } from './properties.controller';
import { PropertiesService } from './properties.service';

describe('PropertiesController', () => {
  let controller: PropertiesController;
  const service = { proposalContext: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PropertiesController],
      providers: [{ provide: PropertiesService, useValue: service }],
    }).compile();

    controller = module.get<PropertiesController>(PropertiesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('returns the context for the property requested by Commercial', async () => {
    const context = { chemicalHistory: { averageMonthlyCost: 0, months: 1 }, latestFee: null };
    service.proposalContext.mockResolvedValue(context);
    await expect(controller.proposalContext('selected-property')).resolves.toEqual(context);
    expect(service.proposalContext).toHaveBeenCalledWith('selected-property');
  });
});
