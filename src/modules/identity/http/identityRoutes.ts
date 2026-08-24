import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { EmailPasswordAdapter } from '../adapters/provider/EmailPasswordAdapter';
import { PrismaRefreshTokenRepository } from '../adapters/repository/PrismaRefreshTokenRepository';
import { PrismaUserRepository } from '../adapters/repository/PrismaUserRepository';
import { JwtSessionTokenAdapter } from '../adapters/token/JwtSessionTokenAdapter';
import { DeleteAccount } from '../use-cases/DeleteAccount';
import { Logout } from '../use-cases/Logout';
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
  const logout = new Logout(refreshTokenRepository);
  const deleteAccount = new DeleteAccount(userRepository, refreshTokenRepository);

  const controller = new IdentityController(signUp, signIn, refreshSession, logout, deleteAccount);

  router.post('/sign-up', controller.handleSignUp);
  router.post('/sign-in', controller.handleSignIn);
  router.post('/refresh', controller.handleRefresh);
  router.post('/logout', controller.handleLogout);
  router.delete('/account', authMiddleware, controller.handleDeleteAccount);

  return router;
}
