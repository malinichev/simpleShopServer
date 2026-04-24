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
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  SetPasswordDto,
  UpdateProfileDto,
  RequestEmailChangeDto,
  ConfirmEmailChangeDto,
  AuthResponseDto,
  TokensDto,
} from './dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RefreshTokenGuard } from './guards/refresh-token.guard';
import { Public } from '@/common/decorators/public.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/modules/users/entities/user.entity';
import { CreateAddressDto, UpdateAddressDto } from '@/modules/users/dto';
import { UsersService } from '@/modules/users/users.service';
import { MailService } from '@/modules/mail/mail.service';
import { TokenAudience, UserWithTokenAudience } from '@/common/types';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private usersService: UsersService,
    private mailService: MailService,
    private configService: ConfigService,
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
  @ApiOperation({
    summary: 'Обновление профиля текущего пользователя',
    description:
      'Только firstName/lastName/phone/avatar. Email — через /auth/request-email-change, пароль — через /auth/change-password.',
  })
  @ApiResponse({ status: 200, description: 'Профиль обновлён' })
  @ApiResponse({ status: 401, description: 'Не авторизован' })
  async updateProfile(
    @CurrentUser() user: User,
    @Body() updateData: UpdateProfileDto,
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

  @Post('set-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Установка начального пароля для OAuth-only юзера',
    description:
      'Работает только если у пользователя ещё не задан пароль (hasPassword=false). Для смены существующего пароля — /change-password.',
  })
  @ApiResponse({ status: 200, description: 'Пароль установлен' })
  @ApiResponse({ status: 400, description: 'Пароль уже задан' })
  async setPassword(
    @CurrentUser() user: User,
    @Body() dto: SetPasswordDto,
  ): Promise<{ message: string }> {
    await this.usersService.setInitialPassword(user.id, dto.newPassword);
    return { message: 'Пароль установлен' };
  }

  @Post('request-email-change')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Шаг 1: запросить смену email',
    description:
      'Проверяет текущий пароль, шлёт письмо со ссылкой на новый email. Текущий email НЕ меняется до подтверждения.',
  })
  @ApiResponse({ status: 200, description: 'Письмо отправлено' })
  @ApiResponse({
    status: 400,
    description: 'Неверный/невалидный email или пароль не установлен',
  })
  @ApiResponse({ status: 401, description: 'Неверный текущий пароль' })
  @ApiResponse({ status: 409, description: 'Email уже занят' })
  async requestEmailChange(
    @CurrentUser() user: User,
    @Body() dto: RequestEmailChangeDto,
  ): Promise<{ message: string }> {
    const { token } = await this.usersService.requestEmailChange(
      user.id,
      dto.newEmail,
      dto.currentPassword,
    );

    const webUrl =
      this.configService.get<string>('webUrl') || 'http://localhost:3002';
    await this.mailService.sendEmailChangeVerification(dto.newEmail, {
      firstName: user.firstName,
      verificationUrl: `${webUrl}/auth/confirm-email-change?token=${token}`,
      expiresIn: '1 час',
    });

    return {
      message:
        'Письмо отправлено на новый адрес. Перейдите по ссылке для подтверждения.',
    };
  }

  @Public()
  @Post('confirm-email-change')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Шаг 2: подтвердить смену email',
    description:
      'Применяет новый email и инвалидирует все refresh-токены. Юзер должен заново залогиниться с новым email.',
  })
  @ApiResponse({ status: 200, description: 'Email обновлён' })
  @ApiResponse({
    status: 400,
    description: 'Недействительный или истёкший токен',
  })
  @ApiResponse({
    status: 409,
    description: 'Новый email был занят пока ждали подтверждение',
  })
  async confirmEmailChange(
    @Body() dto: ConfirmEmailChangeDto,
  ): Promise<{ message: string }> {
    await this.usersService.confirmEmailChange(dto.token);
    return { message: 'Email обновлён. Войдите с новым адресом.' };
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
