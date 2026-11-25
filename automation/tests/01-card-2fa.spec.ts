import { test, expect } from '@playwright/test';
import { RazorpayDemoPage } from '../pages/RazorpayDemoPage';
import { CheckoutIframePage } from '../pages/CheckoutIframePage';
import { Bank3DSPage } from '../pages/Bank3DSPage';
import { watchPaymentCreateAjax } from '../utils/network';

test.describe('Core Flow 01: Credit/Debit Card to Bank 3DS OTP Page', () => {
  test('navigates into Razorpay iframe, submits card, asserts network payload (₹1.00 = 100 paise), and reaches 3DS OTP screen', async ({
    page,
  }) => {
    const demoPage = new RazorpayDemoPage(page);
    const checkout = new CheckoutIframePage(page);
    const bank3ds = new Bank3DSPage(page);

    await demoPage.goto();
    await demoPage.openCheckoutModal();

    await checkout.completeContactStepIfPresent(
      process.env.TEST_CONTACT || '9876543210',
      process.env.TEST_EMAIL || 'qa.automation@example.com'
    );

    await checkout.assertAmountOneRupee();
    await checkout.selectCardPayment();
    await checkout.fillCardDetails({
      number: process.env.TEST_CARD_NUMBER || '4111111111111111',
      expiry: process.env.TEST_CARD_EXPIRY || '12/28',
      cvv: process.env.TEST_CARD_CVV || '123',
      holderName: process.env.TEST_CARD_HOLDER || 'QA Automation',
    });

    // Attach network interception & popup listener prior to submitting payment
    const assertPaymentNetwork = watchPaymentCreateAjax(page, 100);
    const popupPromise = page.waitForEvent('popup').catch(() => null as never);

    await checkout.submitPayment();

    const networkResult = await assertPaymentNetwork();
    expect(networkResult.status).toBe(200);
    expect(networkResult.amount).toBe(100);

    // Reach Bank 3DS / ACS OTP screen and assert ₹1.00 amount + OTP input box
    const acsSurface = await bank3ds.waitForAcsSurface(popupPromise);
    await bank3ds.assertAmountAndOtpInput(acsSurface);
  });
});
