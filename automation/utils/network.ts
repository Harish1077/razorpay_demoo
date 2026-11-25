import { expect, Page, Response } from '@playwright/test';

export interface PaymentCreateAssertionResult {
  url: string;
  status: number;
  amount: number | null;
  paymentId?: string;
}

/**
 * Attaches a response waiter for Razorpay's payment creation endpoint
 * (`/standard_checkout/payments/create/ajax` or `/v1/standard_checkout/payments/create/ajax`)
 * and validates HTTP 200 + 100 paise (₹1.00) payload.
 */
export function watchPaymentCreateAjax(page: Page, expectedAmountPaise = 100) {
  const responsePromise = page.waitForResponse(
    (res: Response) =>
      res.url().includes('/standard_checkout/payments/create/ajax') &&
      res.request().method() === 'POST',
    { timeout: 30_000 }
  );

  return async (): Promise<PaymentCreateAssertionResult> => {
    const response = await responsePromise;
    const status = response.status();
    expect(status, 'Expected /standard_checkout/payments/create/ajax HTTP status to be 200').toBe(200);

    let parsedBody: Record<string, unknown> | null = null;
    try {
      parsedBody = (await response.json()) as Record<string, unknown>;
    } catch {
      parsedBody = null;
    }

    // Extract amount from response JSON or fallback to POST form payload
    let detectedAmount: number | null = null;
    if (parsedBody) {
      const paymentObj = parsedBody.payment as Record<string, unknown> | undefined;
      const orderObj = parsedBody.order as Record<string, unknown> | undefined;
      const rawAmount =
        parsedBody.amount ??
        paymentObj?.amount ??
        orderObj?.amount ??
        null;
      if (rawAmount !== null && rawAmount !== undefined) {
        detectedAmount = Number(rawAmount);
      }
    }

    if (detectedAmount === null) {
      const postData = response.request().postData() || '';
      const params = new URLSearchParams(postData);
      const paramAmount = params.get('amount');
      if (paramAmount) {
        detectedAmount = Number(paramAmount);
      }
    }

    expect(
      detectedAmount,
      `Expected payment amount to equal ${expectedAmountPaise} paise (₹${(expectedAmountPaise / 100).toFixed(2)})`
    ).toBe(expectedAmountPaise);

    const paymentId =
      (parsedBody?.razorpay_payment_id as string | undefined) ||
      (parsedBody?.payment_id as string | undefined) ||
      ((parsedBody?.payment as Record<string, unknown> | undefined)?.id as string | undefined);

    return {
      url: response.url(),
      status,
      amount: detectedAmount,
      paymentId,
    };
  };
}
