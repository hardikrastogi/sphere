import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) throw new ConflictException('Email or username already in use');

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: { username: dto.username, email: dto.email, passwordHash },
    });
const access_token = this.jwt.sign({ sub: user.id, email: user.email });
return {
  access_token,
  user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
};  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.passwordHash) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

const access_token = this.jwt.sign({ sub: user.id, email: user.email });
return {
  access_token,
  user: { id: user.id, username: user.username, email: user.email, avatarUrl: user.avatarUrl },
};  }

  private signToken(userId: string, email: string) {
    return { access_token: this.jwt.sign({ sub: userId, email }) };
  }
  async googleLogin(googleUser: { googleId: string; email: string; avatarUrl?: string }) {
  let user = await this.prisma.user.findUnique({ where: { googleId: googleUser.googleId } });

  if (!user) {
    user = await this.prisma.user.findUnique({ where: { email: googleUser.email } });

    if (user) {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: { googleId: googleUser.googleId },
      });
    } else {
      const username = googleUser.email.split('@')[0];
      user = await this.prisma.user.create({
        data: {
          username,
          email: googleUser.email,
          googleId: googleUser.googleId,
          avatarUrl: googleUser.avatarUrl,
        },
      });
    }
  }

  return this.signToken(user.id, user.email);
}
}