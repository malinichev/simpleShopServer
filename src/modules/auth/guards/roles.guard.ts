import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {UserRole} from "@/common/decorators/roles.decorator";
import { TokenAudience } from '@/common/types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Пользователь не авторизован');
    }

    const hasRole = requiredRoles.includes(user.role);

    if (!hasRole) {
      throw new ForbiddenException('Недостаточно прав для выполнения этого действия');
    }

    // If endpoint requires ADMIN or MANAGER role, token must have admin-panel audience
    const isAdminEndpoint = requiredRoles.some(
      (r) => r === UserRole.ADMIN || r === UserRole.MANAGER,
    );
    if (isAdminEndpoint) {
      const tokenAudience = (user as any).__tokenAudience;
      if (tokenAudience !== TokenAudience.ADMIN_PANEL) {
        throw new ForbiddenException('Доступ разрешён только из панели администратора');
      }
    }

    return true;
  }
}
