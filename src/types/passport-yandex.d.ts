declare module 'passport-yandex' {
  import { Strategy as PassportStrategy } from 'passport';
  import { Request } from 'express';

  export interface YandexProfile {
    id: string;
    displayName?: string;
    name?: { familyName?: string; givenName?: string };
    username?: string;
    gender?: string;
    emails?: Array<{ value: string; type?: string }>;
    photos?: Array<{ value: string }>;
    provider: 'yandex';
    _json?: Record<string, unknown>;
    _raw?: string;
  }

  export interface StrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string | string[];
    state?: boolean;
    passReqToCallback?: boolean;
  }

  export type VerifyCallback = (
    err: Error | null,
    user?: unknown,
    info?: unknown,
  ) => void;

  export type VerifyFunction = (
    accessToken: string,
    refreshToken: string,
    profile: YandexProfile,
    done: VerifyCallback,
  ) => void | Promise<void>;

  export type VerifyFunctionWithRequest = (
    req: Request,
    accessToken: string,
    refreshToken: string,
    profile: YandexProfile,
    done: VerifyCallback,
  ) => void | Promise<void>;

  export class Strategy extends PassportStrategy {
    constructor(
      options: StrategyOptions,
      verify: VerifyFunction | VerifyFunctionWithRequest,
    );
    name: string;
  }
}
