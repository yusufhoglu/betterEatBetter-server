/** "Is this user currently coached by a human dietitian?" — owned by the practice module. */
export interface ManagedClientPort {
  isManagedClient(userId: string): Promise<boolean>;
}
