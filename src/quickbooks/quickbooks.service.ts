import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

type QuickBooksConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  environment: string;
  scope: string;
};

@Injectable()
export class QuickBooksService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  private getConfig(): QuickBooksConfig {
    const values = {
      clientId: this.config.get<string>('QBO_CLIENT_ID')?.trim(),
      clientSecret: this.config.get<string>('QBO_CLIENT_SECRET')?.trim(),
      redirectUri: this.config.get<string>('QBO_REDIRECT_URI')?.trim(),
      environment: this.config.get<string>('QBO_ENVIRONMENT')?.trim() || 'production',
      scope: this.config.get<string>('QBO_SCOPE')?.trim() || 'com.intuit.quickbooks.accounting',
    };
    if (!values.clientId || !values.clientSecret || !values.redirectUri) {
      throw new InternalServerErrorException('QuickBooks OAuth variables are incomplete.');
    }
    return values as QuickBooksConfig;
  }

  private signState(value: string) {
    return createHmac('sha256', this.getConfig().clientSecret).update(value).digest('hex');
  }

  createAuthorizationUrl() {
    const config = this.getConfig();
    const payload = `${Date.now()}.${randomBytes(18).toString('hex')}`;
    const state = `${payload}.${this.signState(payload)}`;
    const params = new URLSearchParams({
      client_id: config.clientId,
      response_type: 'code',
      scope: config.scope,
      redirect_uri: config.redirectUri,
      state,
    });
    return { authorizationUrl: `https://appcenter.intuit.com/connect/oauth2?${params.toString()}` };
  }

  private validateState(state: string) {
    const parts = state?.split('.') ?? [];
    if (parts.length !== 3) throw new BadRequestException('Invalid QuickBooks OAuth state.');
    const [timestamp, nonce, signature] = parts;
    const payload = `${timestamp}.${nonce}`;
    const expected = this.signState(payload);
    const validSignature = signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    const fresh = Number(timestamp) > Date.now() - 10 * 60 * 1000;
    if (!validSignature || !fresh) throw new BadRequestException('Expired or invalid QuickBooks OAuth state.');
  }

  async completeAuthorization(input: { code: string; realmId: string; state: string }) {
    if (!input.code || !input.realmId || !input.state) throw new BadRequestException('QuickBooks callback is incomplete.');
    this.validateState(input.state);
    const config = this.getConfig();
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const tokenResponse = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: input.code, redirect_uri: config.redirectUri }),
    });
    if (!tokenResponse.ok) throw new BadRequestException('QuickBooks rejected the OAuth authorization.');
    const tokens = (await tokenResponse.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokens.access_token || !tokens.refresh_token) throw new BadRequestException('QuickBooks did not return the required tokens.');
    await this.prisma.quickBooksConnection.upsert({
      where: { realmId: input.realmId },
      create: { realmId: input.realmId, environment: config.environment, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000) },
      update: { environment: config.environment, accessToken: tokens.access_token, refreshToken: tokens.refresh_token, expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000) },
    });
    return { realmId: input.realmId };
  }

  private apiBaseUrl() {
    return this.getConfig().environment.toLowerCase() === 'production'
      ? 'https://quickbooks.api.intuit.com'
      : 'https://sandbox-quickbooks.api.intuit.com';
  }

  private async accessTokenFor(connection: { id: string; accessToken: string; refreshToken: string; expiresAt: Date | null }) {
    if (connection.expiresAt && connection.expiresAt.getTime() > Date.now() + 60_000) {
      return connection.accessToken;
    }

    const config = this.getConfig();
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
    const response = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: connection.refreshToken }),
    });
    if (!response.ok) throw new BadRequestException('QuickBooks refresh token rejected. Reconnect QuickBooks.');
    const tokens = (await response.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
    if (!tokens.access_token || !tokens.refresh_token) throw new BadRequestException('QuickBooks refresh response is incomplete.');
    await this.prisma.quickBooksConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000),
      },
    });
    return tokens.access_token;
  }

  async testEstimate(estimateNumber: string) {
    const number = estimateNumber.trim();
    if (!number) throw new BadRequestException('Estimate number is required.');
    const connection = await this.prisma.quickBooksConnection.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!connection) throw new BadRequestException('QuickBooks is not connected.');
    const token = await this.accessTokenFor(connection);
    const safeNumber = number.replace(/'/g, "\\'");
    const query = `select * from Estimate where DocNumber = '${safeNumber}'`;
    const url = `${this.apiBaseUrl()}/v3/company/${encodeURIComponent(connection.realmId)}/query?query=${encodeURIComponent(query)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
    const payload = (await response.json()) as {
      QueryResponse?: { Estimate?: Array<Record<string, unknown>> };
      Fault?: { Error?: Array<{ Message?: string; Detail?: string }> };
    };
    if (!response.ok) {
      const fault = payload.Fault?.Error?.[0];
      const detail = fault?.Detail || fault?.Message || `HTTP ${response.status}`;
      throw new BadRequestException(`QuickBooks could not read the estimate: ${detail}`);
    }
    const estimate = payload.QueryResponse?.Estimate?.[0];
    if (!estimate) throw new BadRequestException(`Estimate ${number} was not found in QuickBooks.`);
    return {
      estimateNumber: estimate.DocNumber,
      quickbooksEstimateId: estimate.Id,
      status: estimate.TxnStatus,
      estimateDate: estimate.TxnDate,
      totalAmount: estimate.TotalAmt,
      customer: estimate.CustomerRef,
      lines: Array.isArray(estimate.Line) ? estimate.Line : [],
      lastUpdated: estimate.MetaData,
    };
  }
}
