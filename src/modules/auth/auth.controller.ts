import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  AuthResponseDto,
  TokensDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/modules/users/entities/user.entity';
import {
  UpdateUserDto,
  CreateAddressDto,
  UpdateAddressDto,
} from '@/modules/users/dto';
import { UsersService } from '@/modules/users/users.service';
import { TokenAudience, UserWithTokenAudience } from '@/common/types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
  ) {}

  @Public()
  @Post('register')
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Регистрация нового пользователя' })
  @ApiResponse({
    status: 201,
    description: 'Пользователь успешно зарегистрирован',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'Пользователь уже существует' })
  async register(
    @Body() registerDto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const audience = TokenAudience.WEB;
    const result = await this.authService.register(registerDto);

    this.setRefreshTokenCookie(response, result.refreshToken, audience);

    return result;
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Вход в систему' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({
    status: 200,
    description: 'Успешный вход',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Неверные учётные данные' })
  async login(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponseDto> {
    const audience =
      (req['tokenAudience'] as TokenAudience) || TokenAudience.WEB;
    const result = await this.authService.login(req.user as User, audience);

    this.setRefreshTokenCookie(response, result.refreshToken, audience);

    return result;
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Выход из системы' })
  @ApiResponse({ status: 200, description: 'Успешный выход' })
  async logout(
    @CurrentUser() user: User,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ message: string }> {
    const audience =
      (user as User & UserWithTokenAudience).__tokenAudience ||
      TokenAudience.WEB;
    await this.authService.logout(user.id, audience);

    this.clearRefreshTokenCookie(response, audience);

    return { message: 'Успешный выход из системы' };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RefreshTokenGuard)
  @ApiOperation({ summary: 'Обновление токенов' })
  @ApiResponse({
    status: 200,
    description: 'Токены успешно обновлены',
    type: TokensDto,
  })
  @ApiResponse({ status: 401, description: 'Недействительный refresh token' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokensDto> {
    const user = req.user as User;
    const refreshToken = req['refreshTokenValue'] as string;
    const audience =
      (req['tokenAudience'] as TokenAudience) || TokenAudience.WEB;

    const tokens = await this.authService.refreshTokens(
      user.id,
      refreshToken,
      audience,
    );

    this.setRefreshTokenCookie(response, tokens.refreshToken, audience);

    return tokens;
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @ApiOperation({ summary: 'Запрос на сброс пароля' })
  @ApiResponse({
    status: 200,
    description: 'Письмо отправлено (если email существует)',
  })
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.forgotPassword(forgotPasswordDto.email);
    return {
      message:
        'Если пользователь с таким email существует, на него будет отправлено письмо с инструкциями',
    };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Сброс пароля по токену' })
  @ApiResponse({ status: 200, description: 'Пароль успешно изменён' })
  @ApiResponse({
    status: 400,
    description: 'Недействительный или истёкший токен',
  })
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(
      resetPasswordDto.token,
      resetPasswordDto.password,
    );
    return { message: 'Пароль успешно изменён' };
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Подтверждение email' })
  @ApiResponse({ status: 200, description: 'Email успешно подтверждён' })
  @ApiResponse({
    status: 400,
    description: 'Недействительный или истёкший токен',
  })
  async verifyEmail(
    @Body('token') token: string,
  ): Promise<{ message: string }> {
    await this.authService.verifyEmail(token);
    return { message: 'Email успешно подтверждён' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Получение профиля текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Профиль пользователя' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async getProfile(@CurrentUser() user: User) {
    return this.authService.getProfile(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновление профиля текущего пользователя' })
  @ApiResponse({ status: 200, description: 'Профиль обновлён' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() updateData: UpdateUserDto,
  ) {
    return this.authService.updateProfile(user.id, updateData);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Смена пароля' })
  @ApiResponse({ status: 200, description: 'Пароль успешно изменён' })
  @ApiResponse({ status: 401, description: 'Неверный текущий пароль' })
  async changePassword(
    @CurrentUser() user: User,
    @Body() changePasswordDto: ChangePasswordDto,
  ): Promise<{ message: string }> {
    await this.authService.changePassword(user.id, changePasswordDto);
    return { message: 'Пароль успешно изменён' };
  }

  @Post('me/addresses')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Добавить адрес доставки' })
  @ApiResponse({ status: 201, description: 'Адрес добавлен' })
  async addAddress(@CurrentUser() user: User, @Body() dto: CreateAddressDto) {
    const updated = await this.usersService.addAddress(user.id, dto);
    return this.usersService.sanitizeUser(updated);
  }

  @Patch('me/addresses/:addressId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Обновить адрес доставки' })
  @ApiResponse({ status: 200, description: 'Адрес обновлён' })
  async updateAddress(
    @CurrentUser() user: User,
    @Param('addressId') addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    const updated = await this.usersService.updateAddress(
      user.id,
      addressId,
      dto,
    );
    return this.usersService.sanitizeUser(updated);
  }

  @Delete('me/addresses/:addressId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Удалить адрес доставки' })
  @ApiResponse({ status: 200, description: 'Адрес удалён' })
  async removeAddress(
    @CurrentUser() user: User,
    @Param('addressId') addressId: string,
  ) {
    const updated = await this.usersService.removeAddress(user.id, addressId);
    return this.usersService.sanitizeUser(updated);
  }

  private getCookieName(audience: TokenAudience): string {
    return audience === TokenAudience.ADMIN_PANEL
      ? 'refreshToken_admin'
      : 'refreshToken';
  }

  private getCookieOptions(): {
    secure: boolean;
    sameSite: 'lax';
    domain?: string;
  } {
    const cookieDomain = process.env.COOKIE_DOMAIN; // e.g. '.yourdomain.com'
    return {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    };
  }

  private setRefreshTokenCookie(
    response: Response,
    refreshToken: string,
    audience: TokenAudience,
  ): void {
    response.cookie(this.getCookieName(audience), refreshToken, {
      httpOnly: true,
      ...this.getCookieOptions(),
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 дней
      path: '/',
    });
  }

  private clearRefreshTokenCookie(
    response: Response,
    audience: TokenAudience,
  ): void {
    response.clearCookie(this.getCookieName(audience), {
      httpOnly: true,
      ...this.getCookieOptions(),
      path: '/',
    });
  }
}
