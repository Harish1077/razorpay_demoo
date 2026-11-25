import { expect, Page } from '@playwright/test';

export class GoogleMessagesPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async openInTab(): Promise<void> {
    await this.page.goto('https://messages.google.com/web', { waitUntil: 'domcontentloaded' });
    // Ensure the persistent profile is already QR-paired
    const conversationList = this.page.locator('mws-conversations-list, [role="list"]').first();
    await expect(conversationList).toBeVisible({ timeout: 25_000 });
  }

  /**
   * Polls incoming SMS threads matching the configured bank sender regex
   * and extracts a 6-digit OTP via `/\b\d{6}\b/`.
   */
  async waitForSixDigitOtp(senderPattern: RegExp, timeoutMs = 60_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      const matchingConversation = this.page
        .locator('mws-conversation-list-item, [role="listitem"]')
        .filter({ hasText: senderPattern })
        .first();

      if (await matchingConversation.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await matchingConversation.click();
        const latestMessages = this.page.locator('mws-text-message-part, [data-e2e-message-text]');
        const count = await latestMessages.count();
        if (count > 0) {
          const latestText = (await latestMessages.nth(count - 1).innerText()).trim();
          const otpMatch = latestText.match(/\b\d{6}\b/);
          if (otpMatch) {
            return otpMatch[0];
          }
        }
      }

      await this.page.waitForTimeout(2_000);
    }

    throw new Error(`Timed out after ${timeoutMs}ms waiting for 6-digit OTP SMS matching ${senderPattern}`);
  }
}
