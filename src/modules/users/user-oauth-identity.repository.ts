import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  UserOAuthIdentity,
  OAuthProvider,
  OAuthProfileData,
} from './entities/user-oauth-identity.entity';

@Injectable()
export class UserOAuthIdentityRepository {
  constructor(
    @InjectRepository(UserOAuthIdentity)
    private readonly repository: Repository<UserOAuthIdentity>,
  ) {}

  findByProvider(
    provider: OAuthProvider,
    providerId: string,
  ): Promise<UserOAuthIdentity | null> {
    return this.repository.findOne({ where: { provider, providerId } });
  }

  findByUserId(userId: string): Promise<UserOAuthIdentity[]> {
    return this.repository.find({
      where: { userId },
      order: { createdAt: 'ASC' },
    });
  }

  findById(id: string): Promise<UserOAuthIdentity | null> {
    return this.repository.findOne({ where: { id } });
  }

  link(params: {
    userId: string;
    provider: OAuthProvider;
    providerId: string;
    email?: string | null;
    profileData: OAuthProfileData;
  }): Promise<UserOAuthIdentity> {
    const identity = this.repository.create(params);
    return this.repository.save(identity);
  }

  async updateProfile(
    id: string,
    patch: { email?: string | null; profileData?: OAuthProfileData },
  ): Promise<UserOAuthIdentity | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    return this.repository.save({ ...existing, ...patch });
  }

  async unlink(id: string): Promise<void> {
    await this.repository.delete(id);
  }
}
