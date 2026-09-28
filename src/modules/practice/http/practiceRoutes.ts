import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { env } from '../../../shared/config/env';
import { prisma } from '../../../shared/persistence/db';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import { ActivateDietitian } from '../use-cases/ActivateDietitian';
import { AlertRuleSettings } from '../use-cases/AlertRuleSettings';
import { GetClientAnalytics } from '../use-cases/GetClientAnalytics';
// from '../use-cases/ActivateDietitian';
import { ClientAccessPolicy } from '../use-cases/ClientAccessPolicy';
import { ClientNotes } from '../use-cases/ClientNotes';
import { CreateInviteCode } from '../use-cases/CreateInviteCode';
import { EndLink } from '../use-cases/EndLink';
import { GetClientOverview } from '../use-cases/GetClientOverview';
import { GetMyAccessLog } from '../use-cases/GetMyAccessLog';
import { GetMyLink } from '../use-cases/GetMyLink';
import { GetPracticeMe } from '../use-cases/GetPracticeMe';
import { JoinDietitian } from '../use-cases/JoinDietitian';
import { ListClients } from '../use-cases/ListClients';
import { ListOrganizationMembers } from '../use-cases/ListOrganizationMembers';
import { PreviewInvite } from '../use-cases/PreviewInvite';
import { ReadClientData } from '../use-cases/ReadClientData';
import { ReassignClient } from '../use-cases/ReassignClient';
import { RotateInviteKey } from '../use-cases/RotateInviteKey';
import { SetClientPlan } from '../use-cases/SetClientPlan';
import { UpdateConsent } from '../use-cases/UpdateConsent';
import { UpdateDietitianProfile } from '../use-cases/UpdateDietitianProfile';
import { PracticeController } from './PracticeController';
import {
  buildClientDataAdapter,
  buildInsightsService,
  linkThreads,
  managedClientCache,
  practiceRepository,
  resolveInviteCodeSecret,
} from './practiceWiring';

// Invite codes carry a 32-bit MAC — safe only because guessing is throttled hard.
const CODE_ATTEMPT_LIMIT = 10;
const CODE_ATTEMPT_WINDOW_SECONDS = 15 * 60;

/** Mounted at /practice. */
export function practiceRoutes(): Router {
  const router = Router();

  const repository = practiceRepository;
  const secret = resolveInviteCodeSecret();
  const threads = linkThreads;
  const policy = new ClientAccessPolicy(repository);
  const clientData = buildClientDataAdapter();
  const insights = buildInsightsService(clientData);

  const controller = new PracticeController(
    {
      getPracticeMe: new GetPracticeMe(repository, threads),
      activateDietitian: new ActivateDietitian(repository),
      updateDietitianProfile: new UpdateDietitianProfile(repository),
      createInviteCode: new CreateInviteCode(repository, secret, env.INVITE_CODE_DEFAULT_VALIDITY_DAYS),
      rotateInviteKey: new RotateInviteKey(repository),
      previewInvite: new PreviewInvite(repository, secret),
      joinDietitian: new JoinDietitian(repository, threads, managedClientCache, secret),
      getMyLink: new GetMyLink(repository, threads),
      updateConsent: new UpdateConsent(repository),
      endLink: new EndLink(repository, policy, clientData, threads, managedClientCache),
      getMyAccessLog: new GetMyAccessLog(repository),
      listClients: new ListClients(repository, clientData, policy),
      getClientOverview: new GetClientOverview(repository, clientData, threads, policy),
      readClientData: new ReadClientData(clientData, policy),
      setClientPlan: new SetClientPlan(clientData, threads, policy),
      clientNotes: new ClientNotes(repository, policy),
      listOrganizationMembers: new ListOrganizationMembers(repository),
      reassignClient: new ReassignClient(repository, threads, policy),
      getClientAnalytics: new GetClientAnalytics(policy, insights),
      alertRuleSettings: new AlertRuleSettings(repository, insights),
    },
    (key) => checkRateLimit(key, CODE_ATTEMPT_LIMIT, CODE_ATTEMPT_WINDOW_SECONDS),
  );

  router.use(authMiddleware);

  router.get('/me', controller.handleGetMe);

  // dietitian account
  router.post('/dietitian/activate', controller.handleActivate);
  router.patch('/dietitian/profile', controller.handleUpdateProfile);
  router.post('/invites', controller.handleCreateInvite);
  router.post('/invites/rotate', controller.handleRotateInviteKey);
  router.get('/organizations/:organizationId/members', controller.handleListMembers);
  router.get('/alert-rules', controller.handleListAlertRules);
  router.put('/alert-rules', controller.handleUpdateAlertRules);

  // client side
  router.post('/invites/preview', controller.handlePreviewInvite);
  router.post('/join', controller.handleJoin);
  router.get('/me/link', controller.handleGetMyLink);
  router.patch('/me/link/consent', controller.handleUpdateConsent);
  router.post('/me/link/end', controller.handleEndMyLink);
  router.get('/me/access-log', controller.handleGetAccessLog);

  // dietitian → clients
  router.get('/clients', controller.handleListClients);
  router.get('/clients/:clientId', controller.handleGetClient);
  router.get('/clients/:clientId/meals', controller.handleGetClientMeals);
  router.get('/clients/:clientId/body-measurements', controller.handleGetClientMeasurements);
  router.get('/clients/:clientId/water', controller.handleGetClientWater);
  router.get('/clients/:clientId/steps', controller.handleGetClientSteps);
  router.get('/clients/:clientId/analytics', controller.handleGetClientAnalytics);
  router.put('/clients/:clientId/plan', controller.handleSetClientPlan);
  router.post('/clients/:clientId/end', controller.handleEndClientLink);
  router.patch('/clients/:clientId/assignee', controller.handleReassign);
  router.get('/clients/:clientId/notes', controller.handleListNotes);
  router.post('/clients/:clientId/notes', controller.handleCreateNote);
  router.patch('/clients/:clientId/notes/:noteId', controller.handleUpdateNote);
  router.delete('/clients/:clientId/notes/:noteId', controller.handleDeleteNote);

  return router;
}
