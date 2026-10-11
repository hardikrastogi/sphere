import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Response } from 'express';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';

const isProd = process.env.NODE_ENV === 'production';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  // 'none'/secure in production because the deployed frontend and backend live on
  // different domains (Vercel + Render) - a cross-site fetch won't carry a 'lax'
  // cookie at all, which would silently break every authenticated request. Locally,
  // 'lax'/insecure is required instead since localhost is plain http.
  private setAuthCookie(res: Response, token: string) {
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.signup(dto);
    this.setAuthCookie(res, access_token);
    return { user };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { access_token, user } = await this.authService.login(dto);
    this.setAuthCookie(res, access_token);
    return { user };
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) res: Response) {
    // Must match setAuthCookie's attributes, or the browser won't recognize it as the same cookie to clear.
    res.clearCookie('token', { httpOnly: true, secure: isProd, sameSite: isProd ? 'none' : 'lax' });
    return { success: true };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth() {}

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthCallback(@Req() req: any, @Res() res: Response) {
    const { access_token } = await this.authService.googleLogin(req.user);
    this.setAuthCookie(res, access_token);
    const clientUrl = process.env.CLIENT_URL?.trim() || 'http://localhost:3000';
    res.redirect(`${clientUrl}/home`); // no token in the URL anymore
  }
}