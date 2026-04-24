import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '@/common/entities/base.entity';
import { User } from './user.entity';

export enum OAuthProvider {
  VK = 'vk',
  YANDEX = 'yandex',
}

export interface OAuthProfileData {
  firstName?: string;
  lastName?: string;
  avatar?: string;
  raw?: Record<string, unknown>;
}

@Entity('user_oauth_identities')
@Unique('UQ_oauth_provider_provider_id', ['provider', 'providerId'])
@Index('IDX_oauth_user_id', ['userId'])
export class UserOAuthIdentity extends BaseEntity {
  @Column({ type: 'enum', enum: OAuthProvider })
  provider: OAuthProvider;

  @Column({ type: 'varchar', length: 255 })
  providerId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column('jsonb', { default: {} })
  profileData: OAuthProfileData;

  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;
}
