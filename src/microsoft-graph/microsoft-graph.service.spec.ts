import { MicrosoftGraphService } from './microsoft-graph.service';

describe('Microsoft Graph email responses', () => {
  it('accepts an empty 202 response from sendMail', async () => {
    const original = global.fetch;
    global.fetch = jest.fn().mockResolvedValue(new Response(null, { status: 202 }));
    const graph = new MicrosoftGraphService({} as any);
    jest.spyOn(graph, 'getAccessToken').mockResolvedValue('test');
    try { await expect(graph.request('/users/test/sendMail', { method: 'POST' })).resolves.toBeUndefined(); }
    finally { global.fetch = original; }
  });
});
