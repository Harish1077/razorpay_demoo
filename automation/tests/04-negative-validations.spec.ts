import { test, expect } from '@playwright/test';
import { RazorpayDemoPage } from '../pages/RazorpayDemoPage';
import { CheckoutIframePage } from '../pages/CheckoutIframePage';

test.describe('QA Negative Validations: Card Luhn, Expired Date, and Invalid UPI VPA', () => {
  test.beforeEach(async ({ page }) => {
    const demoPage = new RazorpayDemoPage(page);
    const checkout = new CheckoutIframePage(page);

    await demoPage.goto();
    await demoPage.openCheckoutModal();

    await checkout.completeContactStepIfPresent(
      process.env.TEST_CONTACT || '9876543210',
      process.env.TEST_EMAIL || 'qa.automation@example.com'
    );
    await checkout.assertAmountOneRupee();
  });

  test('rejects invalid card number failing Luhn checksum while maintaining ₹1.00 amount', async ({ page }) => {
    const checkout = new CheckoutIframePage(page);
    await checkout.assertAmountOneRupee();
    await checkout.selectCardPayment();
    await checkout.fillCardDetails({
      number: '4111111111111112', // Fails Luhn mod-10 check
      expiry: '12/28',
      cvv: '123',
    });
    await checkout.submitPayment();

    const errorMsg = await checkout.assertInlineValidationError(/invalid card|card number|enter a valid card/i);
    expect(errorMsg.length).toBeGreaterThan(0);
    await checkout.assertAmountOneRupee();
  });

  test('rejects expired card expiry date while maintaining ₹1.00 amount', async ({ page }) => {
    const checkout = new CheckoutIframePage(page);
    await checkout.assertAmountOneRupee();
    await checkout.selectCardPayment();
    await checkout.fillCardDetails({
      number: process.env.TEST_CARD_NUMBER || '4111111111111111',
      expiry: '01/20', // Expired
      cvv: '123',
    });
    await checkout.submitPayment();

    const errorMsg = await checkout.assertInlineValidationError(/expiry|expired|valid expiry|invalid date/i);
    expect(errorMsg.length).toBeGreaterThan(0);
    await checkout.assertAmountOneRupee();
  });

  test('rejects invalid UPI VPA format (test@invalid) while maintaining ₹1.00 amount', async ({ page }) => {
    const checkout = new CheckoutIframePage(page);
    await checkout.assertAmountOneRupee();
    await checkout.selectUpiAndEnterVpa('test@invalid');

    const errorMsg = await checkout.assertInlineValidationError(/invalid.*upi|invalid.*vpa|enter a valid upi/i);
    expect(errorMsg.length).toBeGreaterThan(0);
    await checkout.assertAmountOneRupee();
  });
});
