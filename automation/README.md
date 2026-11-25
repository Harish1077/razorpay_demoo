# Razorpay Checkout Playwright Automation Suite

Automated Web Payment Journey & 2FA Verification Suite targeting Razorpay Standard Checkout (`https://razorpay.com/demo/upi/`) using **Playwright + TypeScript** with the **Page Object Model (POM)** pattern.

---

## Coverage Matrix

| Suite | Flow | Key Assertions |
| :--- | :--- | :--- |
| `tests/01-card-2fa.spec.ts` | Credit/Debit Card → 3DS OTP | Switches into `iframe.razorpay-checkout-frame`, fills card credentials, intercepts `/standard_checkout/payments/create/ajax` (`status === 200`, `amount === 100`), reaches Bank 3DS ACS screen and asserts `₹1.00` + OTP input visibility. |
| `tests/02-upi-2fa.spec.ts` | UPI VPA → Collect / QR 2FA | Selects UPI inside iframe, enters VPA, verifies `amount === 100`, asserts UPI Collect countdown timer or QR 2FA canvas renders. |
| `tests/03-netbanking-2fa.spec.ts` | NetBanking → Bank Login Portal | Selects NetBanking, picks target bank (e.g., HDFC/SBI), validates payment creation payload, asserts popup/redirect to Bank 2FA portal. |
| `tests/04-negative-validations.spec.ts` | QA Negative Suite | Asserts inline checkout error messages for Luhn failure (`4111111111111112`), expired card (`01/20`), and invalid UPI VPA (`test@invalid`). |
| `tests/05-bonus-e2e-otp.spec.ts` | Bonus E2E ₹1.00 + SMS OTP | Opens `messages.google.com/web` in Tab 2 via persistent profile, extracts incoming 6-digit bank OTP via `/\b\d{6}\b/`, submits OTP on Bank ACS page, and asserts `"Thanks for your order!"` + Transaction ID. |

---

## Project Architecture

```text
├── playwright.config.ts           # Video recording ('on'), viewport, slowMo, HTML report
├── utils/
│   └── network.ts                 # Intercepts /standard_checkout/payments/create/ajax
├── pages/
│   ├── RazorpayDemoPage.ts        # Demo merchant landing & final order confirmation
│   ├── CheckoutIframePage.ts      # FrameLocator POM for Card, UPI, NetBanking & Negative checks
│   ├── Bank3DSPage.ts             # ACS 3DS OTP & NetBanking portal redirect assertions
│   └── GoogleMessagesPage.ts      # Second-tab SMS OTP reader using /\b\d{6}\b/
├── scripts/
│   └── pair-google-messages.ts    # One-time QR pairing script for persistent Chromium profile
└── tests/
    ├── 01-card-2fa.spec.ts
    ├── 02-upi-2fa.spec.ts
    ├── 03-netbanking-2fa.spec.ts
    ├── 04-negative-validations.spec.ts
    └── 05-bonus-e2e-otp.spec.ts
```

---

## Prerequisites

- **Node.js** `>= 20.x`
- **npm** `>= 10.x`

---

## Quick Start (Re-running on a Fresh System)

1. **Install dependencies and Chromium browser binaries:**
   ```bash
   npm ci
   npx playwright install chromium
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   ```
   Update `.env` with your test/demo card details, UPI VPA, and NetBanking preference.

3. **Run Core Multi-Payment Flows (Card 2FA, UPI 2FA, NetBanking 2FA):**
   ```bash
   npm run test:core
   ```

4. **Run QA Negative Validation Suite:**
   ```bash
   npm run test:negative
   ```

5. **Run Bonus Full E2E ₹1.00 Transaction with Google Messages OTP:**
   First, pair your Android phone's Google Messages Web session once:
   ```bash
   npm run auth:messages
   ```
   Scan the QR code, wait for your SMS threads to load, then close the browser window. Now run:
   ```bash
   npm run test:bonus
   ```

6. **Inspect Video Recordings & HTML Report:**
   Playwright automatically records `.webm` videos for every test run into `test-results/`.
   To open the interactive HTML report:
   ```bash
   npm run report
   ```
