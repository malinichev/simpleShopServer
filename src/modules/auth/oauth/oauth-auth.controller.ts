import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from '../auth.service';
import { UsersService } from '@/modules/users/users.service';
import { Public } from '@/common/decorators/public.decorator';
import { TokenAudience } from '@/common/types';
import { OAuthService } from './oauth.service';
import {
  OAuthStateService,
  OAuthStateMode,
  OAuthStatePayload,
} from './oauth-state.service';
import { OAuthProfileDto } from './oauth-profile.dto';
import {
  OAuthAlreadyLinkedException,
  OAuthEmailConflictException,
} from './oauth.errors';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';
import { VkIdOAuthService } from './vk-id.service';
import { generatePkce } from './pkce.util';

const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';

@ApiTags('auth-oauth')
@Controller('auth')
export class OAuthAuthController {
  private readonly logger = new Logger(OAuthAuthController.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly oauthService: OAuthService,
    private readonly stateService: OAuthStateService,
    private readonly vkIdService: VkIdOAuthService,
  ) {}

  @Public()
  @Get('vk')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Начать вход через VK ID (OAuth 2.1 + PKCE)',
    description:
      'Генерирует PKCE-пару, подписывает state JWT, делает 302-редирект на https://id.vk.ru/authorize. Открывать в браузере, не вызывать из XHR.',
  })
  @ApiQuery({
    name: 'redirectTo',
    required: false,
    description: 'Путь на storefront после успешного логина',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: ['login', 'link'],
    description: 'login (по умолчанию) или link для привязки к текущему юзеру (PR-3)',
  })
  @ApiResponse({ status: 302, description: 'Редирект на id.vk.ru/authorize' })
  async vkInit(
    @Query('redirectTo') redirectTo: string | undefined,
    @Query('mode') mode: OAuthStateMode | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const pkce = generatePkce();
    const state = await this.stateService.sign({
      mode: mode === 'link' ? 'link' : 'login',
      redirectTo,
      codeVerifier: pkce.verifier,
    });

    const url = this.vkIdService.buildAuthorizeUrl({
      state,
      codeChallenge: pkce.challenge,
      scope: 'email',
    });

    res.redirect(url);
  }

  @Public()
  @Get('vk/callback')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Callback от VK ID',
    description:
      'Принимает code+device_id+state от VK ID, обменивает код на токены (PKCE), запрашивает user_info, создаёт/линкует пользователя, ставит refreshToken cookie и делает 302-редирект на OAUTH_SUCCESS_REDIRECT (или OAUTH_ERROR_REDIRECT при ошибке).',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'device_id', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiQuery({ name: 'error', required: false })
  @ApiResponse({ status: 302, description: 'Редирект на storefront' })
  async vkCallback(
    @Query('code') code: string | undefined,
    @Query('device_id') deviceId: string | undefined,
    @Query('state') stateToken: string | undefined,
    @Query('error') error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const errorRedirect =
      this.configService.get<string>('oauth.errorRedirect') || '/login';
    const successRedirect =
      this.configService.get<string>('oauth.successRedirect') ||
      '/auth/callback';

    this.logger.log(
      `VK callback received: code=${code ? 'yes' : 'no'} device_id=${deviceId ? 'yes' : 'no'} state=${stateToken ? `len=${stateToken.length}` : 'no'} error=${error ?? 'none'}`,
    );

    if (error || !code || !deviceId || !stateToken) {
      this.logger.warn(
        `VK callback missing params: code=${!!code} device_id=${!!deviceId} state=${!!stateToken} error=${error ?? ''}`,
      );
      res.redirect(
        this.buildRedirect(errorRedirect, {
          error: error || 'oauth_failed',
        }),
      );
      return;
    }

    let statePayload: OAuthStatePayload;
    try {
      const restored = this.vkIdService.decodeState(stateToken);
      statePayload = await this.stateService.verify(restored);
    } catch {
      res.redirect(this.buildRedirect(errorRedirect, { error: 'bad_state' }));
      return;
    }

    if (!statePayload.codeVerifier) {
      this.logger.warn('VK state payload missing codeVerifier');
      res.redirect(this.buildRedirect(errorRedirect, { error: 'bad_state' }));
      return;
    }

    try {
      const tokens = await this.vkIdService.exchangeCode(
        code,
        deviceId,
        statePayload.codeVerifier,
      );
      const profile = await this.vkIdService.fetchUserInfo(tokens.accessToken);

      await this.completeOAuthLogin(res, statePayload, profile, {
        successRedirect,
        errorRedirect,
      });
    } catch (err) {
      const errorCode = this.mapErrorCode(err);
      res.redirect(this.buildRedirect(errorRedirect, { error: errorCode }));
    }
  }

  @Public()
  @Get('yandex')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Начать вход через Яндекс ID',
    description:
      'Подписывает state JWT, делает 302-редирект на https://oauth.yandex.ru/authorize. Открывать в браузере.',
  })
  @ApiQuery({
    name: 'redirectTo',
    required: false,
    description: 'Путь на storefront после успешного логина',
  })
  @ApiQuery({
    name: 'mode',
    required: false,
    enum: ['login', 'link'],
  })
  @ApiResponse({ status: 302, description: 'Редирект на oauth.yandex.ru/authorize' })
  async yandexInit(
    @Query('redirectTo') redirectTo: string | undefined,
    @Query('mode') mode: OAuthStateMode | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const state = await this.stateService.sign({
      mode: mode === 'link' ? 'link' : 'login',
      redirectTo,
    });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.configService.get<string>('oauth.yandex.clientId') || '',
      redirect_uri:
        this.configService.get<string>('oauth.yandex.callbackUrl') || '',
      state,
    });

    res.redirect(`${YANDEX_AUTHORIZE_URL}?${params.toString()}`);
  }

  @Public()
  @Get('yandex/callback')
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @UseGuards(AuthGuard('yandex'))
  @ApiOperation({
    summary: 'Callback от Яндекс ID',
    description:
      'Passport обменивает code на токен и подтягивает профиль. Создаёт/линкует пользователя, ставит refreshToken cookie и делает 302-редирект на OAUTH_SUCCESS_REDIRECT.',
  })
  @ApiQuery({ name: 'code', required: false })
  @ApiQuery({ name: 'state', required: false })
  @ApiResponse({ status: 302, description: 'Редирект на storefront' })
  async yandexCallback(
    @Req() req: Request,
    @Res() res: Response,
    @Query('state') stateToken: string,
  ): Promise<void> {
    const errorRedirect =
      this.configService.get<string>('oauth.errorRedirect') || '/login';
    const successRedirect =
      this.configService.get<string>('oauth.successRedirect') ||
      '/auth/callback';

    let statePayload: OAuthStatePayload;
    try {
      statePayload = await this.stateService.verify(stateToken);
    } catch {
      res.redirect(this.buildRedirect(errorRedirect, { error: 'bad_state' }));
      return;
    }

    const profile = req.user as OAuthProfileDto | undefined;
    if (!profile || profile.provider !== OAuthProvider.YANDEX) {
      res.redirect(this.buildRedirect(errorRedirect, { error: 'bad_profile' }));
      return;
    }

    await this.completeOAuthLogin(res, statePayload, profile, {
      successRedirect,
      errorRedirect,
    });
  }

  private async completeOAuthLogin(
    res: Response,
    statePayload: OAuthStatePayload,
    profile: OAuthProfileDto,
    redirects: { successRedirect: string; errorRedirect: string },
  ): Promise<void> {
    try {
      if (statePayload.mode === 'link') {
        res.redirect(
          this.buildRedirect(redirects.errorRedirect, {
            error: 'link_mode_not_ready',
          }),
        );
        return;
      }

      const { user } = await this.oauthService.findOrCreateByOAuth(profile);

      /**
       * Вместо cookie генерим короткоживущий handoff-JWT и кладём его в
       * success-redirect URL. Клиент на фронте заберёт handoff и POST-нёт
       * его на /auth/oauth-exchange через свой домен — cookie установится
       * на домене фронта, а не на ngrok/кастомном callback-домене.
       */
      const handoff = await this.stateService.signHandoff(user.id);

      res.redirect(
        this.buildRedirect(redirects.successRedirect, {
          status: 'ok',
          redirectTo: statePayload.redirectTo,
          handoff,
        }),
      );
    } catch (err) {
      const code = this.mapErrorCode(err);
      res.redirect(
        this.buildRedirect(redirects.errorRedirect, { error: code }),
      );
    }
  }

  @Public()
  @Post('oauth-exchange')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @ApiOperation({
    summary: 'Обмен handoff-token на сессию',
    description:
      'Клиент передаёт handoff из URL-редиректа. Бэк валидирует, выдаёт access token и ставит refresh cookie на домене клиента.',
  })
  @ApiResponse({ status: 200, description: 'Сессия создана' })
  @ApiResponse({ status: 401, description: 'Недействительный handoff' })
  async oauthExchange(
    @Body('handoff') handoffToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (!handoffToken) {
      throw new BadRequestException('handoff token required');
    }

    const payload = await this.stateService.verifyHandoff(handoffToken);
    const user = await this.usersService.findByIdOrFail(payload.userId);

    const audience = TokenAudience.WEB;
    const result = await this.authService.login(user, audience);

    this.setRefreshTokenCookie(res, result.refreshToken, audience);

    return {
      user: result.user,
      accessToken: result.accessToken,
    };
  }

  private mapErrorCode(err: unknown): string {
    if (err instanceof OAuthEmailConflictException) return 'email_taken';
    if (err instanceof OAuthAlreadyLinkedException) return 'already_linked';
    return 'oauth_failed';
  }

  private buildRedirect(
    base: string,
    params: Record<string, string | undefined>,
  ): string {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v) qs.append(k, v);
    }
    const sep = base.includes('?') ? '&' : '?';
    return qs.toString() ? `${base}${sep}${qs.toString()}` : base;
  }

  private setRefreshTokenCookie(
    response: Response,
    refreshToken: string,
    audience: TokenAudience,
  ): void {
    const cookieDomain = process.env.COOKIE_DOMAIN;
    const cookieName =
      audience === TokenAudience.ADMIN_PANEL
        ? 'refreshToken_admin'
        : 'refreshToken';
    response.cookie(cookieName, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });
  }
}
