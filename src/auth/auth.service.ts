import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { allowedAreas, APP_ROLES, AppRole } from './auth.constants';
import { passwordMatches } from './password';

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  expiresAt: Date;
};

function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

function bearerToken(authorization?: string) {
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) throw new UnauthorizedException('Login required.');
  return token;
}

function appRole(value: string): AppRole | null {
  return APP_ROLES.includes(value as AppRole) ? (value as AppRole) : null;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    let user = await this.prisma.appUser.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      const chemicalOwner = await this.prisma.chemicalOwner.findUnique({
        where: { email: normalizedEmail },
      });
      if (chemicalOwner?.active && passwordMatches(password, chemicalOwner.passwordHash)) {
        user = await this.prisma.appUser.upsert({
          where: { email: normalizedEmail },
          update: {
            name: chemicalOwner.name,
            passwordHash: chemicalOwner.passwordHash,
            role: 'CHEMICALS',
            active: true,
          },
          create: {
            name: chemicalOwner.name,
            email: normalizedEmail,
            passwordHash: chemicalOwner.passwordHash,
            role: 'CHEMICALS',
          },
        });
      }
    }

    const role = user ? appRole(user.role) : null;
    if (!user?.active || !role || !passwordMatches(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    await this.prisma.$transaction([
      this.prisma.appSession.deleteMany({ where: { expiresAt: { lte: new Date() } } }),
      this.prisma.appSession.create({
        data: { tokenHash: tokenHash(token), expiresAt, userId: user.id },
      }),
    ]);

    return {
      token,
      expiresAt,
      user: { id: user.id, name: user.name, email: user.email, role },
      allowedAreas: allowedAreas(role),
    };
  }

  async session(authorization?: string): Promise<AuthenticatedUser> {
    const token = bearerToken(authorization);
    const hash = tokenHash(token);
    const session = await this.prisma.appSession.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date() && session.user.active) {
      const role = appRole(session.user.role);
      if (role) {
        return {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role,
          expiresAt: session.expiresAt,
        };
      }
    }

    // Existing Chemicals owner sessions remain valid while users transition
    // to the shared application login.
    const ownerSession = await this.prisma.chemicalOwnerSession.findUnique({
      where: { tokenHash: hash },
      include: { owner: true },
    });
    if (ownerSession && ownerSession.expiresAt > new Date() && ownerSession.owner.active) {
      return {
        id: ownerSession.owner.id,
        name: ownerSession.owner.name,
        email: ownerSession.owner.email,
        role: 'CHEMICALS',
        expiresAt: ownerSession.expiresAt,
      };
    }

    throw new UnauthorizedException('Session expired or invalid.');
  }

  async sessionResponse(authorization?: string) {
    const user = await this.session(authorization);
    return {
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
      expiresAt: user.expiresAt,
      allowedAreas: allowedAreas(user.role),
    };
  }

  async logout(authorization?: string) {
    const token = bearerToken(authorization);
    const hash = tokenHash(token);
    await this.prisma.$transaction([
      this.prisma.appSession.deleteMany({ where: { tokenHash: hash } }),
      this.prisma.chemicalOwnerSession.deleteMany({ where: { tokenHash: hash } }),
    ]);
  }
}
