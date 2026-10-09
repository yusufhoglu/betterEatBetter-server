/** Tells a client their dietitian saved a new nutrition plan. Best-effort. */
export interface PlanNotifierPort {
  notifyPlanUpdated(clientId: string): Promise<void>;
}
