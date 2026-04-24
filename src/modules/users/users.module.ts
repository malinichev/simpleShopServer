import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UserOAuthIdentity } from './entities/user-oauth-identity.entity';
import { UsersRepository } from './users.repository';
import { UserOAuthIdentityRepository } from './user-oauth-identity.repository';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { OrdersModule } from '@/modules/orders/orders.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserOAuthIdentity]),
    forwardRef(() => OrdersModule),
  ],
  controllers: [UsersController],
  providers: [UsersRepository, UserOAuthIdentityRepository, UsersService],
  exports: [UsersService, UserOAuthIdentityRepository],
})
export class UsersModule {}
