export interface AlertService {
  notifySyncFailures(input: { userId: string; failCount: number; message: string }): Promise<void>;
}

export class ConsoleAlertService implements AlertService {
  async notifySyncFailures(input: { userId: string; failCount: number; message: string }): Promise<void> {
    console.error(
      `[ALERT] user=${input.userId} failCount=${input.failCount} message=${input.message}`
    );
  }
}
