import { Router } from 'express';
import { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import { PrismaRefreshTokenRepository } from '../adapters/repository/PrismaRefreshTokenRepository';
import { PrismaUserRepository } from '../adapters/repository/PrismaUserRepository';
import { JwtSessionTokenAdapter } from '../adapters/token/JwtSessionTokenAdapter';
import { RefreshSession } from '../use-cases/RefreshSession';
import { SignIn } from '../use-cases/SignIn';
import { SignUp } from '../use-cases/SignUp';
import { IdentityController } from './IdentityController';

export function identityRoutes(): Router {
  const router = Router();

  const userRepository = new PrismaUserRepository();
  const emailPasswordAdapter = new EmailPasswordAdapter(userRepository);
  const sessionTokenPort = new JwtSessionTokenAdapter();
  const refreshTokenRepository = new PrismaRefreshTokenRepository();

  const signUp = new SignUp(userRepository, emailPasswordAdapter, sessionTokenPort, refreshTokenRepository);
  const signIn = new SignIn(emailPasswordAdapter, sessionTokenPort, refreshTokenRepository);
  const refreshSession = new RefreshSession(refreshTokenRepository, sessionTokenPort);

  const controller = new IdentityController(signUp, signIn, refreshSession);

  router.post('/sign-up', controller.handleSignUp);
  router.post('/sign-in', controller.handleSignIn);
  router.post('/refresh', controller.handleRefresh);

  return router;
}
