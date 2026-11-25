import { chromium, test, expect } from '@playwright/test';
import path from 'path';
import { RazorpayDemoPage } from '../pages/RazorpayDemoPage';
import { CheckoutIframePage } from '../pages/CheckoutIframePage';
import { Bank3DSPage } from '../pages/Bank3DSPage';
import { GoogleMessagesPage } from '../pages/GoogleMessagesPage';
import { watchPaymentCreateAjax } from '../utils/network';

test.describe('Bonus Flow 05: Full End-to-End ₹1.00 Transaction with Google Messages SMS OTP', () => {
  test('reads live 6-digit SMS OTP from Google Messages Web Tab 2 via /\\b\\d{6}\\b/ and completes order', async () => {
    const userDataDir = path.resolve(
      __dirname,
      '..',
      process.env.MESSAGES_USER_DATA_DIR || '.auth/messages-profile'
    );

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      recordVideo: {
        dir: path.resolve(__dirname, '../test-results/bonus-e2e-otp'),
        size: { width: 1280, height: 800 },
      },
      slowMo: 250,
    });

    try {
      const checkoutPage = context.pages()[0] || (await context.newPage());
      const messagesTab = await context.newPage();

      const demoPage = new RazorpayDemoPage(checkoutPage);
      const checkout = new CheckoutIframePage(checkoutPage);
      const bank3ds = new Bank3DSPage(checkoutPage);
      const googleMessages = new GoogleMessagesPage(messagesTab);

      // Step 1: Verify Google Messages Web is paired in Tab 2 before initiating payment
      await googleMessages.openInTab();
      await checkoutPage.bringToFront();

      // Step 2: Execute Razorpay ₹1.00 Card Checkout in Tab 1
      await demoPage.goto();
      await demoPage.openCheckoutModal();

      await checkout.completeContactStepIfPresent(
        process.env.TEST_CONTACT || '9876543210',
        process.env.TEST_EMAIL || 'qa.automation@example.com'
      );

      await checkout.selectCardPayment();
      await checkout.fillCardDetails({
        number: process.env.TEST_CARD_NUMBER || '4111111111111111',
        expiry: process.env.TEST_CARD_EXPIRY || '12/28',
        cvv: process.env.TEST_CARD_CVV || '123',
        holderName: process.env.TEST_CARD_HOLDER || 'QA Automation',
      });

      const assertPaymentNetwork = watchPaymentCreateAjax(checkoutPage, 100);
      const popupPromise = checkoutPage.waitForEvent('popup').catch(() => null as never);

      await checkout.submitPayment();

      const networkResult = await assertPaymentNetwork();
      expect(networkResult.status).toBe(200);
      expect(networkResult.amount).toBe(100);

      // Step 3: Wait for Bank ACS 3DS OTP page and verify ₹1.00 amount
      const acsSurface = await bank3ds.waitForAcsSurface(popupPromise);
      await bank3ds.assertAmountAndOtpInput(acsSurface);

      // Step 4: Switch to Tab 2 (Google Messages for Web), extract 6-digit OTP via regex
      await messagesTab.bringToFront();
      const senderRegex = new RegExp(
        process.env.MESSAGES_SENDER_FILTER || 'HDFC|SBI|ICICI|AXIS|KOTAK|BANK|RZRPAY',
        'i'
      );
      const otpCode = await googleMessages.waitForSixDigitOtp(senderRegex, 60_000);
      expect(otpCode).toMatch(/^\d{6}$/);

      // Step 5: Switch back to Tab 1 / ACS page, submit OTP, and assert final confirmation
      await checkoutPage.bringToFront();
      await bank3ds.submitOtp(acsSurface, otpCode);

      const transactionRef = await demoPage.assertOrderSuccessScreen();
      expect(transactionRef.length).toBeGreaterThan(0);
    } finally {
      await context.close();
    }
  });
});
