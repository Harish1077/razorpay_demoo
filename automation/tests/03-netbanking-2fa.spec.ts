import { test, expect } from '@playwright/test';
import { RazorpayDemoPage } from '../pages/RazorpayDemoPage';
import { CheckoutIframePage } from '../pages/CheckoutIframePage';
import { Bank3DSPage } from '../pages/Bank3DSPage';
import { watchPaymentCreateAjax } from '../utils/network';

test.describe('Core Flow 03: NetBanking to Bank Login / 2FA Portal', () => {
  test('selects bank inside Razorpay iframe, validates network payload, and asserts redirection to Bank 2FA portal', async ({
    page,
  }) => {
    const demoPage = new RazorpayDemoPage(page);
    const checkout = new CheckoutIframePage(page);
    const bankPortal = new Bank3DSPage(page);

    await demoPage.goto();
    await demoPage.openCheckoutModal();

    await checkout.completeContactStepIfPresent(
      process.env.TEST_CONTACT || '9876543210',
      process.env.TEST_EMAIL || 'qa.automation@example.com'
    );

    await checkout.assertAmountOneRupee();
    const targetBank = process.env.TEST_NETBANKING_BANK || 'HDFC';
    const assertPaymentNetwork = watchPaymentCreateAjax(page, 100);
    const popupPromise = page.waitForEvent('popup', { timeout: 25_000 }).catch(() => page);

    await checkout.selectNetBankingAndPickBank(targetBank);

    const networkResult = await assertPaymentNetwork();
    expect(networkResult.status).toBe(200);
    expect(networkResult.amount).toBe(100);

    const bankTab = await popupPromise;
    const redirectedUrl = await bankPortal.assertNetBankingPortalRedirect(bankTab);
    expect(redirectedUrl).not.toBe('');
  });
});
