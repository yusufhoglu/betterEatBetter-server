import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { createModuleLogger } from '../../../shared/observability/logger';
import { ALERT_RULES, type AlertScope, type AlertSeverity } from '../domain/alertRules';
import type { PracticeRepositoryPort } from '../ports/PracticeRepositoryPort';
import type { ClientInsightsService } from './ClientInsightsService';

const logger = createModuleLogger('practice');

export interface AlertRuleView {
  id: string;
  scope: AlertScope;
  severity: AlertSeverity;
  unit: string;
  defaultThreshold: number;
  enabled: boolean;
  /** Effective threshold (the dietitian's, else the default). */
  threshold: number;
  customized: boolean;
}

/** A dietitian's alert rule configuration: defaults merged with their overrides. */
export class AlertRuleSettings {
  constructor(
    private readonly repository: PracticeRepositoryPort,
    private readonly insights: ClientInsightsService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async list(dietitianId: string): Promise<AlertRuleView[]> {
    await this.requireDietitian(dietitianId);
    const settings = new Map((await this.repository.listAlertRuleSettings(dietitianId)).map((s) => [s.ruleId, s]));
    return ALERT_RULES.map((rule) => {
      const s = settings.get(rule.id);
      return {
        id: rule.id,
        scope: rule.scope,
        severity: rule.severity,
        unit: rule.unit,
        defaultThreshold: rule.defaultThreshold,
        enabled: s?.enabled ?? true,
        threshold: s?.threshold ?? rule.defaultThreshold,
        customized: s !== undefined && (s.threshold !== null || !s.enabled),
      };
    });
  }

  /** `threshold: null` resets to the default. Re-evaluates the dietitian's clients in the background. */
  async update(
    dietitianId: string,
    changes: Array<{ ruleId: string; enabled: boolean; threshold: number | null }>,
  ): Promise<AlertRuleView[]> {
    await this.requireDietitian(dietitianId);
    for (const change of changes) {
      if (!ALERT_RULES.some((r) => r.id === change.ruleId)) {
        throw new ValidationError('UNKNOWN_ALERT_RULE', `Unknown alert rule ${change.ruleId}`);
      }
      if (change.threshold !== null && (!Number.isFinite(change.threshold) || change.threshold <= 0)) {
        throw new ValidationError('INVALID_ALERT_THRESHOLD', 'threshold must be a positive number');
      }
    }
    await this.repository.saveAlertRuleSettings(dietitianId, changes);
    this.refreshClients(dietitianId).catch((err: unknown) => logger.warn({ err, dietitianId }, 'alert refresh failed'));
    return this.list(dietitianId);
  }

  private async refreshClients(dietitianId: string): Promise<void> {
    for (const link of await this.repository.listActiveLinksForDietitian(dietitianId)) {
      await this.insights.refresh(link, this.now());
    }
  }

  private async requireDietitian(userId: string): Promise<void> {
    if (!(await this.repository.findDietitianProfile(userId))) {
      throw new NotFoundError('NOT_A_DIETITIAN', 'This account is not a dietitian');
    }
  }
}
