import { parseEstimatePdfPages, type EstimatePdfText } from './opportunity-estimate-pdf';

const item = (text: string, x: number, y: number): EstimatePdfText => ({ text, x, y });
const heading = () => [item('Product or service', 45, 500), item('Description', 205, 500), item('Qty', 420, 500), item('Rate', 480, 500), item('Amount', 535, 500)];
const pdf = () => [[item('Estimate no.: 7400', 30, 600), ...heading(), item('1.', 27, 470), item('FILTER', 45, 470), item('POOL: REPLACE FILTER', 205, 470), item('COMMERCIAL POOL', 205, 458), item('1', 430, 470), item('$42.00', 480, 470), item('$42.00', 535, 470), item('2.', 27, 430), item('ACID WASH', 45, 430), item('POOL OR SPA: FULL ACID WASH', 205, 430), item('$2,500.00', 535, 430), item('3.', 27, 400), item('INSTALLATION', 45, 400), item('INSTALLATION', 205, 400), item('$300.00', 535, 400), item('Total', 370, 350), item('$2,842.00', 535, 350), item('Accepted by', 205, 300), item('A customer name', 205, 280)]];

describe('QuickBooks estimate PDF descriptions', () => {
  it('extracts full wrapped descriptions in line order, excluding product labels, prices, quantities and footers', () => {
    expect(parseEstimatePdfPages(pdf(), '7400')).toEqual({ estimateNumber: '7400', total: '2842.00', descriptions: ['POOL: REPLACE FILTER COMMERCIAL POOL', 'POOL OR SPA: FULL ACID WASH', 'INSTALLATION'] });
  });
  it('rejects an unrelated estimate, a missing total and an unsupported table instead of guessing descriptions', () => {
    expect(parseEstimatePdfPages(pdf(), '9999')).toBeNull();
    expect(parseEstimatePdfPages([pdf()[0].filter(row => row.text !== 'Total')], '7400')).toBeNull();
    expect(parseEstimatePdfPages([pdf()[0].filter(row => row.text !== 'Description')], '7400')).toBeNull();
  });
  it('preserves separate identical line items and descriptions continuing onto another page', () => {
    const pages = [[item('Estimate no.: 7400', 30, 600), ...heading(), item('1.', 27, 470), item('POOL SERVICE', 205, 470)], [...heading(), item('CONTINUED', 205, 470), item('2.', 27, 440), item('INSTALLATION', 205, 440), item('3.', 27, 400), item('INSTALLATION', 205, 400), item('Total', 370, 350), item('$0.00', 535, 350)]];
    expect(parseEstimatePdfPages(pages, '7400')).toEqual({ estimateNumber: '7400', total: '0.00', descriptions: ['POOL SERVICE CONTINUED', 'INSTALLATION', 'INSTALLATION'] });
  });
});
