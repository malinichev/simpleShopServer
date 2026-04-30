import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User, UserRole } from '@/modules/users/entities/user.entity';
import {
  UserOAuthIdentity,
  OAuthProfileData,
} from '@/modules/users/entities/user-oauth-identity.entity';
import { UsersService } from '@/modules/users/users.service';
import { UserOAuthIdentityRepository } from '@/modules/users/user-oauth-identity.repository';
import { OAuthProfileDto } from './oauth-profile.dto';
import {
  OAuthAlreadyLinkedException,
  OAuthCannotUnlinkLastException,
  OAuthEmailConflictException,
} from './oauth.errors';
import { OAuthEventsService } from './oauth-events.service';

export interface OAuthResolveResult {
  user: User;
  identity: UserOAuthIdentity;
  /** true если пользователь был создан в этом вызове */
  created: boolean;
}

@Injectable()
export class OAuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly identityRepo: UserOAuthIdentityRepository,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly events: OAuthEventsService,
  ) {}

  /**
   * Login-flow: найти identity → или привязать к существующему юзеру по email →
   * или создать нового юзера + identity в транзакции.
   */
  async findOrCreateByOAuth(
    profile: OAuthProfileDto,
  ): Promise<OAuthResolveResult> {
    const result = await this.resolveOAuth(profile);
    this.events.emit({
      type: 'oauth.login',
      userId: result.user.id,
      provider: profile.provider,
      created: result.created,
      email: profile.email ?? null,
      occurredAt: new Date(),
    });
    return result;
  }

  private async resolveOAuth(
    profile: OAuthProfileDto,
  ): Promise<OAuthResolveResult> {
    const existing = await this.identityRepo.findByProvider(
      profile.provider,
      profile.providerId,
    );
    if (existing) {
      await this.identityRepo.updateProfile(existing.id, {
        email: profile.email ?? existing.email,
        profileData: this.buildProfileData(profile),
      });
      const user = await this.usersService.findByIdOrFail(existing.userId);
      const refreshed = await this.identityRepo.findById(existing.id);
      return { user, identity: refreshed!, created: false };
    }

    if (profile.email && profile.emailVerified) {
      const byEmail = await this.usersService.findByEmail(profile.email);
      if (byEmail) {
        const identity = await this.identityRepo.link({
          userId: byEmail.id,
          provider: profile.provider,
          providerId: profile.providerId,
          email: profile.email,
          profileData: this.buildProfileData(profile),
        });
        return { user: byEmail, identity, created: false };
      }
    }

    if (profile.email && !profile.emailVerified) {
      const byEmail = await this.usersService.findByEmail(profile.email);
      if (byEmail) {
        throw new OAuthEmailConflictException();
      }
    }

    return this.createUserWithIdentity(profile);
  }

  /**
   * Привязка identity к уже авторизованному пользователю.
   * Ошибка, если этот providerId уже привязан к кому-либо.
   */
  async linkToUser(
    userId: string,
    profile: OAuthProfileDto,
  ): Promise<UserOAuthIdentity> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new NotFoundException('Пользователь не найден');
    }

    const existing = await this.identityRepo.findByProvider(
      profile.provider,
      profile.providerId,
    );
    if (existing) {
      if (existing.userId === userId) {
        const updated = await this.identityRepo.updateProfile(existing.id, {
          email: profile.email ?? existing.email,
          profileData: this.buildProfileData(profile),
        });
        return updated!;
      }
      throw new OAuthAlreadyLinkedException();
    }

    const identity = await this.identityRepo.link({
      userId,
      provider: profile.provider,
      providerId: profile.providerId,
      email: profile.email,
      profileData: this.buildProfileData(profile),
    });
    this.events.emit({
      type: 'oauth.linked',
      userId,
      provider: profile.provider,
      email: profile.email ?? null,
      occurredAt: new Date(),
    });
    return identity;
  }

  async listUserIdentities(userId: string): Promise<UserOAuthIdentity[]> {
    return this.identityRepo.findByUserId(userId);
  }

  /**
   * Отвязка identity. Запрещает отвязку последнего способа входа
   * (если у пользователя нет пароля и это единственная identity).
   */
  async unlinkIdentity(userId: string, identityId: string): Promise<void> {
    const identity = await this.identityRepo.findById(identityId);
    if (!identity || identity.userId !== userId) {
      throw new NotFoundException('Привязка не найдена');
    }

    const user = await this.usersService.findByIdOrFail(userId);
    const all = await this.identityRepo.findByUserId(userId);
    const others = all.filter((i) => i.id !== identityId);

    if (!user.password && others.length === 0) {
      throw new OAuthCannotUnlinkLastException();
    }

    await this.identityRepo.unlink(identityId);
    this.events.emit({
      type: 'oauth.unlinked',
      userId,
      provider: identity.provider,
      occurredAt: new Date(),
    });
  }

  private async createUserWithIdentity(
    profile: OAuthProfileDto,
  ): Promise<OAuthResolveResult> {
    return this.dataSource.transaction(async (manager) => {
      const user = await manager.save(User, {
        email: profile.email ?? this.generatePlaceholderEmail(profile),
        password: null,
        firstName: profile.firstName ?? 'User',
        lastName: profile.lastName ?? '',
        role: UserRole.CUSTOMER,
        avatar: profile.avatar,
        addresses: [],
        wishlist: [],
        isEmailVerified: Boolean(profile.email && profile.emailVerified),
      });

      const identity = await manager.save(UserOAuthIdentity, {
        userId: user.id,
        provider: profile.provider,
        providerId: profile.providerId,
        email: profile.email,
        profileData: this.buildProfileData(profile),
      });

      return { user, identity, created: true };
    });
  }

  private buildProfileData(profile: OAuthProfileDto): OAuthProfileData {
    return {
      firstName: profile.firstName,
      lastName: profile.lastName,
      avatar: profile.avatar,
      raw: profile.raw,
    };
  }

  /**
   * Если провайдер не отдал email (VK без scope=email) — генерируем
   * placeholder вида vk-123456@oauth.local, чтобы не падать на UNIQUE.
   * Позже юзер сможет задать настоящий email в профиле.
   */
  private generatePlaceholderEmail(profile: OAuthProfileDto): string {
    return `${profile.provider}-${profile.providerId}@oauth.local`;
  }
}
