import { test, expect } from '@playwright/test';
import { RazorpayDemoPage } from '../pages/RazorpayDemoPage';
import { CheckoutIframePage } from '../pages/CheckoutIframePage';
import { watchPaymentCreateAjax } from '../utils/network';

test.describe('Core Flow 02: UPI VPA to Collect Timer / QR 2FA Screen', () => {
  test('enters UPI VPA inside Razorpay iframe, validates payment creation payload, and asserts Collect/QR 2FA view', async ({
    page,
  }) => {
    const demoPage = new RazorpayDemoPage(page);
    const checkout = new CheckoutIframePage(page);

    await demoPage.goto();
    await demoPage.openCheckoutModal();

    await checkout.completeContactStepIfPresent(
      process.env.TEST_CONTACT || '9876543210',
      process.env.TEST_EMAIL || 'qa.automation@example.com'
    );

    await checkout.assertAmountOneRupee();
    const assertPaymentNetwork = watchPaymentCreateAjax(page, 100);

    await checkout.selectUpiAndEnterVpa(process.env.TEST_UPI_VPA || 'success@razorpay');

    const networkResult = await assertPaymentNetwork();
    expect(networkResult.status).toBe(200);
    expect(networkResult.amount).toBe(100);

    await checkout.assertUpi2FaScreenVisible();
  });
});
