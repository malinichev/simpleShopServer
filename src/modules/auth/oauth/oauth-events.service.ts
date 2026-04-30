import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'node:events';
import { OAuthProvider } from '@/modules/users/entities/user-oauth-identity.entity';

export interface OAuthLoginEvent {
  type: 'oauth.login';
  userId: string;
  provider: OAuthProvider;
  /** true если пользователь был создан в результате этого login */
  created: boolean;
  email: string | null;
  occurredAt: Date;
}

export interface OAuthLinkedEvent {
  type: 'oauth.linked';
  userId: string;
  provider: OAuthProvider;
  email: string | null;
  occurredAt: Date;
}

export interface OAuthUnlinkedEvent {
  type: 'oauth.unlinked';
  userId: string;
  provider: OAuthProvider;
  occurredAt: Date;
}

export type OAuthEvent =
  | OAuthLoginEvent
  | OAuthLinkedEvent
  | OAuthUnlinkedEvent;

type OAuthEventName = OAuthEvent['type'];
type OAuthEventListener<E extends OAuthEvent = OAuthEvent> = (event: E) => void;

/**
 * Минимальный hook-point для подписчиков (analytics/audit/notifications).
 * Wrapper над node:events с типизацией. Не использует @nestjs/event-emitter
 * чтобы не вводить новую зависимость.
 *
 * Пример подписки в любом модуле:
 *   constructor(events: OAuthEventsService) {
 *     events.on('oauth.login', (e) => this.audit.record(e));
 *   }
 *
 * Если потом потребуется wildcard/pattern subscriptions — мигрировать на
 * `@nestjs/event-emitter`. Public API совместим.
 */
@Injectable()
export class OAuthEventsService {
  private readonly logger = new Logger(OAuthEventsService.name);
  private readonly emitter = new EventEmitter();

  emit(event: OAuthEvent): void {
    this.logger.debug(
      `[${event.type}] user=${event.userId} provider=${event.provider}`,
    );
    this.emitter.emit(event.type, event);
  }

  on<T extends OAuthEventName>(
    type: T,
    listener: OAuthEventListener<Extract<OAuthEvent, { type: T }>>,
  ): void {
    this.emitter.on(type, listener as OAuthEventListener);
  }

  off<T extends OAuthEventName>(
    type: T,
    listener: OAuthEventListener<Extract<OAuthEvent, { type: T }>>,
  ): void {
    this.emitter.off(type, listener as OAuthEventListener);
  }
}
