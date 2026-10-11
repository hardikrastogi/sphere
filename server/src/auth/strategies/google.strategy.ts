import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor() {
    // .trim() guards against a stray trailing newline/space from a dashboard-set env var.
    super({
      clientID: process.env.GOOGLE_CLIENT_ID!.trim(),
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      callbackURL: process.env.GOOGLE_CALLBACK_URL!.trim(),
      scope: ['email', 'profile'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { id, name, emails, photos } = profile;
    done(null, {
      googleId: id,
      email: emails[0].value,
      avatarUrl: photos?.[0]?.value,
    });
  }
}