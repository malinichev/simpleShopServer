export enum TokenAudience {
  ADMIN_PANEL = 'admin-panel',
  WEB = 'web',
}

/**
 * User object augmented with token audience by JwtStrategy.
 * The __tokenAudience property is set in jwt.strategy.ts validate().
 */
export interface UserWithTokenAudience {
  __tokenAudience?: TokenAudience;
}
