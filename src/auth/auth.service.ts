import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma.service';
import { verifyPassword } from './password.util';

export interface LoginResult {
  accessToken: string;
  user: { id: string; username: string; fullName: string; roles: string[] };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /**
   * Validate credentials and issue a signed JWT carrying the user's roles.
   * The token roles let RolesGuard authorize without a DB round-trip.
   */
  async login(username: string, password: string): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { roles: { include: { role: true } } },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const roles = user.roles.map((ur) => ur.role.name);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      username: user.username,
      roles,
    });

    return {
      accessToken,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        roles,
      },
    };
  }
}
