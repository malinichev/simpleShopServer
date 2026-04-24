import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';

export interface OAuthProfileDto {
  provider: OAuthProvider;
  providerId: string;
  email?: string | null;
  /**
   * True если email подтверждён провайдером.
   * Yandex — всегда true (default_email верифицирован).
   * VK — всегда false (email не гарантированно верифицирован).
   */
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  raw?: Record<string, unknown>;
}
