import { expect, FrameLocator, Locator, Page } from '@playwright/test';

export interface CardInput {
  number: string;
  expiry: string;
  cvv: string;
  holderName?: string;
}

export class CheckoutIframePage {
  readonly page: Page;
  readonly frame: FrameLocator;

  // Optional contact/email pre-step
  readonly contactInput: Locator;
  readonly emailInput: Locator;
  readonly proceedButton: Locator;

  // Payment method tabs / tiles
  readonly cardMethodButton: Locator;
  readonly upiMethodButton: Locator;
  readonly netbankingMethodButton: Locator;

  // Card fields
  readonly cardNumberInput: Locator;
  readonly cardExpiryInput: Locator;
  readonly cardCvvInput: Locator;
  readonly cardNameInput: Locator;
  readonly submitPayButton: Locator;

  // UPI fields & 2FA screen
  readonly upiVpaInput: Locator;
  readonly upiVerifyAndPayButton: Locator;
  readonly upiCollectTimer: Locator;
  readonly upiQrCanvas: Locator;

  // NetBanking fields
  readonly bankSearchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.frame = page.frameLocator('iframe.razorpay-checkout-frame, iframe[src*="checkout.razorpay.com"]').first();

    this.contactInput = this.frame.locator('input[name="contact"], input[type="tel"]').first();
    this.emailInput = this.frame.locator('input[name="email"], input[type="email"]').first();
    this.proceedButton = this.frame.locator('button:has-text("Proceed"), button:has-text("Continue")').first();

    this.cardMethodButton = this.frame
      .locator('[data-value="card"], button:has-text("Card"), [role="button"]:has-text("Cards")')
      .first();
    this.upiMethodButton = this.frame
      .locator('[data-value="upi"], button:has-text("UPI"), [role="button"]:has-text("UPI")')
      .first();
    this.netbankingMethodButton = this.frame
      .locator('[data-value="netbanking"], button:has-text("Netbanking"), [role="button"]:has-text("Netbanking")')
      .first();

    this.cardNumberInput = this.frame
      .locator('input[name="card[number]"], input[autocomplete="cc-number"], input[placeholder*="Card Number"]')
      .first();
    this.cardExpiryInput = this.frame
      .locator('input[name="card[expiry]"], input[autocomplete="cc-exp"], input[placeholder*="MM / YY"], input[placeholder*="Expiry"]')
      .first();
    this.cardCvvInput = this.frame
      .locator('input[name="card[cvv]"], input[autocomplete="cc-csc"], input[placeholder*="CVV"]')
      .first();
    this.cardNameInput = this.frame
      .locator('input[name="card[name]"], input[autocomplete="cc-name"], input[placeholder*="Name on Card"]')
      .first();
    this.submitPayButton = this.frame
      .locator('button[type="submit"], button:has-text("Pay Now"), button:has-text("Pay ₹"), button:has-text("Continue")')
      .last();

    this.upiVpaInput = this.frame
      .locator('input[name="vpa"], input[placeholder*="UPI ID"], input[placeholder*="example@okaxis"]')
      .first();
    this.upiVerifyAndPayButton = this.frame
      .locator('button:has-text("Verify and Pay"), button:has-text("Pay Now"), button[type="submit"]')
      .last();
    this.upiCollectTimer = this.frame.locator('text=/Approve payment|Complete your payment|0\\d:\\d{2}|minutes/i').first();
    this.upiQrCanvas = this.frame.locator('canvas, img[alt*="QR"], [data-testid="qr-code"], svg[class*="qr"]').first();

    this.bankSearchInput = this.frame
      .locator('input[placeholder*="Search"], input[type="search"]')
      .first();
  }

  async assertAmountOneRupee(): Promise<void> {
    const amountLocator = this.frame.locator('text=/₹\\s*1(\\.00)?/').first();
    await expect(amountLocator, 'Expected Razorpay checkout iframe to display ₹1.00').toBeVisible({ timeout: 15_000 });
    await expect(amountLocator).toContainText(/₹\s*1(\.00)?/);
  }

  async completeContactStepIfPresent(contact: string, email: string): Promise<void> {
    const isContactVisible = await this.contactInput.isVisible({ timeout: 3_500 }).catch(() => false);
    if (!isContactVisible) return;

    await this.contactInput.fill(contact);
    if (await this.emailInput.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await this.emailInput.fill(email);
    }
    if (await this.proceedButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await this.proceedButton.click();
    }
  }

  async selectCardPayment(): Promise<void> {
    if (await this.cardMethodButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.cardMethodButton.click();
    }
    await expect(this.cardNumberInput).toBeVisible();
  }

  async fillCardDetails(card: CardInput): Promise<void> {
    await this.cardNumberInput.fill(card.number);
    await this.cardExpiryInput.fill(card.expiry);
    await this.cardCvvInput.fill(card.cvv);

    if (card.holderName && (await this.cardNameInput.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await this.cardNameInput.fill(card.holderName);
    }
  }

  async submitPayment(): Promise<void> {
    await this.submitPayButton.click();
  }

  async selectUpiAndEnterVpa(vpa: string): Promise<void> {
    if (await this.upiMethodButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await this.upiMethodButton.click();
    }
    await expect(this.upiVpaInput).toBeVisible();
    await this.upiVpaInput.fill(vpa);
    await this.upiVerifyAndPayButton.click();
  }

  async assertUpi2FaScreenVisible(): Promise<void> {
    // Razorpay either displays a UPI Collect countdown timer or a QR code 2FA canvas
    await expect(this.upiCollectTimer.or(this.upiQrCanvas)).toBeVisible({ timeout: 25_000 });
  }

  async selectNetBankingAndPickBank(bankName: string): Promise<void> {
    await expect(this.netbankingMethodButton).toBeVisible();
    await this.netbankingMethodButton.click();

    if (await this.bankSearchInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await this.bankSearchInput.fill(bankName);
    }

    const bankOption = this.frame
      .locator(`[data-value*="${bankName}" i], button:has-text("${bankName}"), label:has-text("${bankName}"), div[role="button"]:has-text("${bankName}")`)
      .first();
    await expect(bankOption).toBeVisible();
    await bankOption.click();

    const payContinueButton = this.frame.locator('button:has-text("Pay Now"), button:has-text("Continue")').first();
    if (await payContinueButton.isVisible({ timeout: 1_500 }).catch(() => false)) {
      await payContinueButton.click();
    }
  }

  async assertInlineValidationError(expectedPattern: RegExp): Promise<string> {
    const errorLocator = this.frame
      .locator('[role="alert"], .error, [class*="error" i], [data-testid*="error" i]')
      .filter({ hasText: expectedPattern })
      .first();

    await expect(errorLocator).toBeVisible({ timeout: 10_000 });
    return (await errorLocator.innerText()).trim();
  }
}
