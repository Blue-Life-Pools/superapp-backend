import { Body, Controller, Get, Headers, HttpCode, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './auth.decorators';
import { LoginDto } from './dto/login.dto';

@Controller('auth')
@ApiTags('Authentication')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  @Public()
  login(@Body() data: LoginDto) {
    return this.auth.login(data.email, data.password);
  }

  @Get('session')
  @ApiBearerAuth('bearer')
  session(@Headers('authorization') authorization?: string) {
    return this.auth.sessionResponse(authorization);
  }

  @Post('logout')
  @ApiBearerAuth('bearer')
  @HttpCode(204)
  async logout(@Headers('authorization') authorization?: string) {
    await this.auth.logout(authorization);
  }
}
