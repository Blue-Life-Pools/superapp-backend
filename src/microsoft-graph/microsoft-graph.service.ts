import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MicrosoftGraphService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  private required(name: string) {
    const value = this.config.get<string>(name)?.trim();
    if (!value) {
      throw new Error(`Missing Microsoft integration configuration: ${name}`);
    }
    return value;
  }

  async getAccessToken() {
    if (this.accessToken && Date.now() < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const tenantId = this.required('MICROSOFT_TENANT_ID');
    const body = new URLSearchParams({
      client_id: this.required('MICROSOFT_CLIENT_ID'),
      client_secret: this.required('MICROSOFT_CLIENT_SECRET'),
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    });
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) {
      throw new Error(`Microsoft authentication failed (${response.status})`);
    }

    const token = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    this.accessToken = token.access_token;
    this.accessTokenExpiresAt = Date.now() + token.expires_in * 1000;
    return this.accessToken;
  }

  async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${await this.getAccessToken()}`,
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });

    if (!response.ok) {
      const details = (await response.text()).slice(0, 600);
      throw new Error(
        `Microsoft Graph request failed (${response.status})${details ? `: ${details}` : ''}`,
      );
    }

    if (response.status === 204 || response.status === 202) return undefined as T;
    return (await response.json()) as T;
  }
}
