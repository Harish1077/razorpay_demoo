import { expect, Locator, Page } from '@playwright/test';

export class RazorpayDemoPage {
  readonly page: Page;
  readonly payTriggerButton: Locator;
  readonly checkoutIframeElement: Locator;

  constructor(page: Page) {
    this.page = page;
    // Matches the primary demo checkout CTA on razorpay.com/demo/upi/
    this.payTriggerButton = page
      .locator(
        'button:has-text("Pay"), button:has-text("Donate"), button:has-text("₹1"), #rzp-button1, .razorpay-payment-button'
      )
      .first();
    this.checkoutIframeElement = page
      .locator('iframe.razorpay-checkout-frame, iframe[src*="checkout.razorpay.com"]')
      .first();
  }

  async goto(): Promise<void> {
    const targetUrl = process.env.RAZORPAY_DEMO_URL || 'https://razorpay.com/demo/upi/';
    await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await expect(this.payTriggerButton).toBeVisible();
  }

  async openCheckoutModal(): Promise<void> {
    await this.payTriggerButton.scrollIntoViewIfNeeded();
    await this.payTriggerButton.click();
    await expect(this.checkoutIframeElement).toBeVisible({ timeout: 25_000 });
  }

  async assertOrderSuccessScreen(): Promise<string> {
    const successBanner = this.page
      .locator('text=/Thanks for your order|Payment Successful|Transaction ID/i')
      .first();
    await expect(successBanner).toBeVisible({ timeout: 30_000 });

    const pageText = (await this.page.textContent('body')) || '';
    const txMatch = pageText.match(/pay_[A-Za-z0-9]+|Transaction ID[:\s]*([A-Za-z0-9_-]+)/i);
    return txMatch ? txMatch[0] : 'CONFIRMED';
  }
}
