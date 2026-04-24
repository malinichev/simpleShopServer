import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { User } from '@/modules/users/entities/user.entity';
import { OAuthService } from './oauth.service';
import { OAuthStateService } from './oauth-state.service';
import { VkIdOAuthService } from './vk-id.service';
import { generatePkce } from './pkce.util';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';
import {
  AuthorizeUrlResponseDto,
  OAuthIdentityDto,
} from './oauth-identity.dto';
import { OAuthCannotUnlinkLastException } from './oauth.errors';

const YANDEX_AUTHORIZE_URL = 'https://oauth.yandex.ru/authorize';

@ApiTags('auth-oauth')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('auth/me/oauth-identities')
export class OAuthAccountController {
  constructor(
    private readonly configService: ConfigService,
    private readonly oauthService: OAuthService,
    private readonly stateService: OAuthStateService,
    private readonly vkIdService: VkIdOAuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список OAuth-привязок текущего пользователя' })
  @ApiResponse({ status: 200, type: [OAuthIdentityDto] })
  async list(@CurrentUser() user: User): Promise<OAuthIdentityDto[]> {
    const identities = await this.oauthService.listUserIdentities(user.id);
    return identities.map((i) => OAuthIdentityDto.from(i));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Отвязать OAuth-привязку' })
  @ApiResponse({ status: 200 })
  @ApiResponse({
    status: 400,
    description: 'cannot_unlink_last_auth_method',
  })
  async unlink(
    @CurrentUser() user: User,
    @Param('id') id: string,
  ): Promise<{ message: string }> {
    try {
      await this.oauthService.unlinkIdentity(user.id, id);
    } catch (err) {
      if (err instanceof OAuthCannotUnlinkLastException) throw err;
      if (err instanceof NotFoundException) throw err;
      throw err;
    }
    return { message: 'unlinked' };
  }

  @Post(':provider/link-init')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Инициировать привязку нового OAuth-аккаунта',
    description:
      'Возвращает authorizeUrl — фронт должен сделать window.location.href=authorizeUrl. В state зашивается userId, callback выполнит linkToUser.',
  })
  @ApiResponse({ status: 200, type: AuthorizeUrlResponseDto })
  async linkInit(
    @CurrentUser() user: User,
    @Param('provider') providerParam: string,
  ): Promise<AuthorizeUrlResponseDto> {
    const provider = providerParam as OAuthProvider;
    if (provider === OAuthProvider.VK) {
      const pkce = generatePkce();
      const state = await this.stateService.sign({
        mode: 'link',
        userId: user.id,
        codeVerifier: pkce.verifier,
      });
      const authorizeUrl = this.vkIdService.buildAuthorizeUrl({
        state,
        codeChallenge: pkce.challenge,
        scope: 'email',
      });
      return { authorizeUrl };
    }

    if (provider === OAuthProvider.YANDEX) {
      const state = await this.stateService.sign({
        mode: 'link',
        userId: user.id,
      });
      const params = new URLSearchParams({
        response_type: 'code',
        client_id:
          this.configService.get<string>('oauth.yandex.clientId') || '',
        redirect_uri:
          this.configService.get<string>('oauth.yandex.callbackUrl') || '',
        state,
      });
      return {
        authorizeUrl: `${YANDEX_AUTHORIZE_URL}?${params.toString()}`,
      };
    }

    throw new BadRequestException('Unsupported provider');
  }
}
