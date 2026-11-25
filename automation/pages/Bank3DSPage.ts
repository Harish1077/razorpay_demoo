import { expect, FrameLocator, Locator, Page } from '@playwright/test';

export class Bank3DSPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Resolves the Bank 3DS / ACS surface whether it opened in a popup window,
   * redirected the current tab, or rendered inside a nested ACS iframe.
   */
  async waitForAcsSurface(popupPromise?: Promise<Page>): Promise<Page | FrameLocator> {
    const checkoutFrame = this.page
      .frameLocator('iframe.razorpay-checkout-frame, iframe[src*="checkout.razorpay.com"]')
      .first();

    if (popupPromise) {
      const maybePopup = await Promise.race([
        popupPromise.then((p) => ({ kind: 'popup' as const, target: p })),
        this.page
          .locator('input[name*="otp" i], input[placeholder*="OTP" i], input[type="tel"], text=/3D Secure|One Time Password|Enter OTP/i')
          .first()
          .waitFor({ state: 'visible', timeout: 25_000 })
          .then(() => ({ kind: 'same-page' as const, target: this.page })),
        checkoutFrame
          .locator('input[name*="otp" i], input[placeholder*="OTP" i], text=/3D Secure|One Time Password|Enter OTP/i')
          .first()
          .waitFor({ state: 'visible', timeout: 25_000 })
          .then(() => ({ kind: 'checkout-frame' as const, target: checkoutFrame })),
      ]).catch(() => ({ kind: 'same-page' as const, target: this.page }));

      if (maybePopup.kind === 'popup') {
        await maybePopup.target.waitForLoadState('domcontentloaded');
        return maybePopup.target;
      }
      if (maybePopup.kind === 'checkout-frame') {
        return maybePopup.target;
      }
    }

    const nestedAcsIframe = this.page.locator('iframe[src*="acs" i], iframe[src*="3ds" i], iframe[name*="acs" i]').first();
    if (await nestedAcsIframe.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return this.page.frameLocator('iframe[src*="acs" i], iframe[src*="3ds" i], iframe[name*="acs" i]').first();
    }

    const otpInCheckoutFrame = checkoutFrame.locator('input[name*="otp" i], input[placeholder*="OTP" i]').first();
    if (await otpInCheckoutFrame.isVisible({ timeout: 3_000 }).catch(() => false)) {
      return checkoutFrame;
    }

    return this.page;
  }

  async assertAmountAndOtpInput(surface: Page | FrameLocator): Promise<Locator> {
    const amountBanner = surface.locator('text=/₹\\s*1(\\.00)?|INR\\s*1(\\.00)?/i').first();
    await expect(amountBanner).toBeVisible({ timeout: 25_000 });

    const otpInput = surface
      .locator('input[name*="otp" i], input[id*="otp" i], input[placeholder*="OTP" i], input[inputmode="numeric"]')
      .first();
    await expect(otpInput).toBeVisible({ timeout: 25_000 });

    return otpInput;
  }

  async submitOtp(surface: Page | FrameLocator, otpCode: string): Promise<void> {
    const otpInput = await this.assertAmountAndOtpInput(surface);
    await otpInput.fill(otpCode);

    const submitOtpButton = surface
      .locator('button[type="submit"], button:has-text("Submit"), button:has-text("Verify"), button:has-text("Confirm")')
      .first();
    await expect(submitOtpButton).toBeVisible();
    await submitOtpButton.click();
  }

  async assertNetBankingPortalRedirect(popupOrPage: Page): Promise<string> {
    await popupOrPage.waitForLoadState('domcontentloaded');
    const currentUrl = popupOrPage.url();
    const pagePortal = popupOrPage
      .locator('input[type="password"], text=/Customer ID|User ID|NetBanking|Login|Razorpay Bank/i')
      .first();
    const framePortal = popupOrPage
      .frameLocator('iframe.razorpay-checkout-frame, iframe[src*="checkout.razorpay.com"]')
      .first()
      .locator('input[type="password"], text=/Customer ID|User ID|NetBanking|Login/i')
      .first();

    await expect(pagePortal.or(framePortal)).toBeVisible({ timeout: 25_000 });
    return currentUrl;
  }
}
