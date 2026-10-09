import { Router } from 'express';
import { authMiddleware } from '../../../shared/auth/authMiddleware';
import { env } from '../../../shared/config/env';
import { prisma } from '../../../shared/persistence/db';
import { checkRateLimit } from '../../../shared/rateLimiting/rateLimiter';
import { createLlmClient } from '../../../shared/llm/llmClientFactory';
import { PrismaDieticianConversationRepository } from '../../dietician/adapters/repository/PrismaDieticianConversationRepository';
import { TieredLlmDieticianAdapter } from '../../dietician/adapters/llm/TieredLlmDieticianAdapter';
import { AssistantTranscripts } from '../../dietician/use-cases/AssistantTranscripts';
import { PreviewAssistantReply } from '../../dietician/use-cases/PreviewAssistantReply';
import { DieticianPreviewAdapter } from '../adapters/assistant/DieticianPreviewAdapter';
import { DieticianTranscriptAdapter } from '../adapters/assistant/DieticianTranscriptAdapter';
import { ActivateDietitian } from '../use-cases/ActivateDietitian';
import { AiAssistantSettings } from '../use-cases/AiAssistantSettings';
import { ClientAiAssistant } from '../use-cases/ClientAiAssistant';
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
import { CatalogFoodSearchAdapter } from '../adapters/food/CatalogFoodSearchAdapter';
import { PrismaMealPlanRepository } from '../adapters/repository/PrismaMealPlanRepository';
import { NotificationsPlanNotifier } from '../adapters/push/NotificationsPlanNotifier';
import { MealPlans } from '../use-cases/MealPlans';
import { AiAssistantController } from './AiAssistantController';
import { MealPlanController } from './MealPlanController';
import { PracticeController } from './PracticeController';
import {
  aiAssistantRepository,
  buildClientDataAdapter,
  buildInsightsService,
  linkThreads,
  managedClientCache,
  practiceRepository,
  resolveAiAssistant,
  resolveInviteCodeSecret,
} from './practiceWiring';

// Invite codes carry a 32-bit MAC — safe only because guessing is throttled hard.
const CODE_ATTEMPT_LIMIT = 10;
const CODE_ATTEMPT_WINDOW_SECONDS = 15 * 60;

// The assistant preview runs the prime model; generous for trying things out, capped against abuse.
const AI_PREVIEW_LIMIT = 30;
const AI_PREVIEW_WINDOW_SECONDS = 60 * 60;

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
      getPracticeMe: new GetPracticeMe(repository, threads, resolveAiAssistant),
      activateDietitian: new ActivateDietitian(repository),
      updateDietitianProfile: new UpdateDietitianProfile(repository),
      createInviteCode: new CreateInviteCode(repository, secret, env.INVITE_CODE_DEFAULT_VALIDITY_DAYS),
      rotateInviteKey: new RotateInviteKey(repository),
      previewInvite: new PreviewInvite(repository, secret),
      joinDietitian: new JoinDietitian(repository, threads, managedClientCache, secret),
      getMyLink: new GetMyLink(repository, threads, resolveAiAssistant),
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

  // The dietitian's AI assistant — reads the AI coach's chats and previews
  // through the dietician module's public use-cases.
  const transcripts = new DieticianTranscriptAdapter(
    new AssistantTranscripts(new PrismaDieticianConversationRepository(prisma)),
  );
  const aiController = new AiAssistantController(
    new AiAssistantSettings(
      repository,
      aiAssistantRepository,
      transcripts,
      new DieticianPreviewAdapter(new PreviewAssistantReply(new TieredLlmDieticianAdapter(createLlmClient()))),
    ),
    new ClientAiAssistant(aiAssistantRepository, transcripts, policy),
    (key) => checkRateLimit(key, AI_PREVIEW_LIMIT, AI_PREVIEW_WINDOW_SECONDS),
  );

  const mealPlanController = new MealPlanController(
    new MealPlans(new PrismaMealPlanRepository(prisma), repository, policy, new CatalogFoodSearchAdapter(), new NotificationsPlanNotifier()),
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

  // dietitian AI assistant
  router.get('/ai/settings', aiController.handleGetSettings);
  router.put('/ai/settings', aiController.handleUpdateSettings);
  router.post('/ai/preview', aiController.handlePreview);
  router.get('/ai/examples', aiController.handleListExamples);
  router.post('/ai/examples', aiController.handleCreateExample);
  router.patch('/ai/examples/:exampleId', aiController.handleUpdateExample);
  router.delete('/ai/examples/:exampleId', aiController.handleDeleteExample);

  // meal plans: letterhead + the dietitian's foods
  router.get('/plan-header', mealPlanController.handleGetHeader);
  router.put('/plan-header', mealPlanController.handleSaveHeader);
  router.get('/foods', mealPlanController.handleSearchFoods);
  router.post('/foods', mealPlanController.handleCreateFood);
  router.put('/foods/:foodId', mealPlanController.handleUpdateFood);
  router.delete('/foods/:foodId', mealPlanController.handleDeleteFood);

  // client side
  router.post('/invites/preview', controller.handlePreviewInvite);
  router.post('/join', controller.handleJoin);
  router.get('/me/link', controller.handleGetMyLink);
  router.patch('/me/link/consent', controller.handleUpdateConsent);
  router.post('/me/link/end', controller.handleEndMyLink);
  router.get('/me/access-log', controller.handleGetAccessLog);
  router.get('/me/meal-plan', mealPlanController.handleGetMyPlan);

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
  router.get('/clients/:clientId/meal-plan', mealPlanController.handleGetClientPlan);
  router.put('/clients/:clientId/meal-plan', mealPlanController.handleSaveClientPlan);
  router.delete('/clients/:clientId/meal-plan', mealPlanController.handleDeleteClientPlan);
  router.get('/clients/:clientId/notes', controller.handleListNotes);
  router.post('/clients/:clientId/notes', controller.handleCreateNote);
  router.patch('/clients/:clientId/notes/:noteId', controller.handleUpdateNote);
  router.delete('/clients/:clientId/notes/:noteId', controller.handleDeleteNote);
  router.get('/clients/:clientId/ai', aiController.handleGetClientAi);
  router.put('/clients/:clientId/ai', aiController.handleUpdateClientAi);
  router.get('/clients/:clientId/ai/conversations', aiController.handleListClientAiConversations);
  router.get('/clients/:clientId/ai/conversations/:conversationId', aiController.handleGetClientAiConversation);

  return router;
}
