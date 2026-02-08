import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = Record<string, unknown>>(_err: unknown, user: TUser): TUser {
    // Не выбрасываем ошибку при отсутствии токена — возвращаем null
    return user || (null as TUser);
  }
}
