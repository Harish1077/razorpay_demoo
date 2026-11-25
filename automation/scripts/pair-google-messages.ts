import { chromium } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function pairGoogleMessages() {
  const userDataDir = path.resolve(
    __dirname,
    '..',
    process.env.MESSAGES_USER_DATA_DIR || '.auth/messages-profile'
  );

  console.log(`Launching persistent Chromium profile at: ${userDataDir}`);
  console.log('Scan the QR code in Google Messages on your Android phone, then close the browser window once conversations load.');

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
  });

  const page = context.pages()[0] || (await context.newPage());
  await page.goto('https://messages.google.com/web', { waitUntil: 'domcontentloaded' });

  await page.waitForEvent('close', { timeout: 0 });
  await context.close();
  console.log('Google Messages profile saved. You can now run: npm run test:bonus');
}

pairGoogleMessages().catch((err) => {
  console.error(err);
  process.exit(1);
});
