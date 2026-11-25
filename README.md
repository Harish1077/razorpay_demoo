# Razorpay Checkout Automation Workbench

A local demo checkout experience and a companion Playwright test suite for exploring Razorpay-style payment flows. The workbench includes a checkout simulator, a transaction activity view, and a browser-based explorer for the automation code.

> **Demo only:** The local app simulates checkout and payment responses; it is not a payment gateway and must not be used to process real payments. The separate Playwright suite targets Razorpay's public demo checkout. Its optional end-to-end OTP test can initiate a ₹1.00 demo transaction, so run it only with payment details and accounts you are authorized to use.

## What’s included

- **Live Checkout:** Try simulated card, UPI, and NetBanking flows, including validation and 2FA screens.
- **Transaction activity:** Review the demo transactions created during the current server session.
- **Playwright Code:** Browse and copy the automation suite’s tests, page objects, utilities, and configuration.
- **Download:** Export the `automation/` project as a ZIP from the workbench.
- **Browser automation:** Test payment flows and negative validation cases against the public Razorpay demo checkout.

## Run the workbench

**Prerequisites:** Node.js `20.19+` or `22.12+`, and npm.

From the repository root:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The development server uses port `3000` by default. Set the `PORT` environment variable to use a different port.

### Workbench scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the local app and API in development mode. |
| `npm run lint` | Type-check the TypeScript project. |
| `npm run build` | Create the production frontend build in `dist/`. |
| `npm start` | Start the server; build first and set `NODE_ENV=production` to serve the production build. |

## Run the Playwright suite

The automation project is separate from the workbench. Open a terminal in `automation/`:

```bash
npm ci
npx playwright install chromium
```

Create `automation/.env` from the example file and adjust the values for your authorized demo setup:

In PowerShell:

```powershell
Copy-Item .env.example .env
```

Then run a suite:

| Command | Description |
| --- | --- |
| `npm run test:core` | Run card 3DS, UPI 2FA, and NetBanking flows. |
| `npm run test:negative` | Check invalid card, expired card, and invalid UPI validation. |
| `npm run test:bonus` | Run the optional full OTP flow; requires a paired Google Messages Web session. |
| `npm run test` | Run all Playwright tests. |
| `npm run test:headed` | Run all tests with a visible browser. |
| `npm run typecheck` | Type-check the automation project. |
| `npm run report` | Open the latest HTML test report. |

For the optional Google Messages OTP flow, first run `npm run auth:messages` and pair the browser with your own account. The automation records videos and keeps traces for failed tests under `automation/test-results/`; the HTML report is written to `automation/playwright-report/`.

## Project layout

```text
src/
  components/       Checkout simulator, code explorer, and live demo views
  types/            Shared workbench types
server.ts           Local API and development server
automation/
  tests/            Playwright payment-flow and validation tests
  pages/            Page Object Model classes
  utils/            Network helpers
  scripts/          Google Messages pairing utility
  playwright.config.ts
```

## Configuration and safety

- Automation settings live in `automation/.env`; see [automation/.env.example](automation/.env.example) for available options.
- Keep personal credentials and session data out of source control. Use test/demo credentials and do not commit `.env` files.
- The main workbench runs its own local checkout simulation. The Playwright suite is an independent project that visits the configured `RAZORPAY_DEMO_URL`.
