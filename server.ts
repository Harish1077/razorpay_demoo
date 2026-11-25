import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const AUTOMATION_DIR = path.resolve(__dirname, 'automation');
const PORT = Number(process.env.PORT) || 3000;

interface AutomationFileEntry {
  path: string;
  name: string;
  category: 'tests' | 'pages' | 'utils' | 'config';
  language: string;
  content: string;
  lines: number;
}

function classifyFile(relPath: string): { category: AutomationFileEntry['category']; language: string } {
  const normalized = relPath.replace(/\\/g, '/');
  let category: AutomationFileEntry['category'] = 'config';
  if (normalized.startsWith('tests/')) category = 'tests';
  else if (normalized.startsWith('pages/')) category = 'pages';
  else if (normalized.startsWith('utils/') || normalized.startsWith('scripts/')) category = 'utils';

  let language = 'text';
  if (normalized.endsWith('.ts')) language = 'typescript';
  else if (normalized.endsWith('.json')) language = 'json';
  else if (normalized.endsWith('.md')) language = 'markdown';
  else if (normalized.endsWith('.yml') || normalized.endsWith('.yaml')) language = 'yaml';

  return { category, language };
}

function collectAutomationFiles(dir: string, baseDir = dir): AutomationFileEntry[] {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results: AutomationFileEntry[] = [];

  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'test-results' || entry.name === 'playwright-report') {
      continue;
    }
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectAutomationFiles(fullPath, baseDir));
    } else {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const content = fs.readFileSync(fullPath, 'utf-8');
      const { category, language } = classifyFile(relPath);
      results.push({
        path: relPath,
        name: entry.name,
        category,
        language,
        content,
        lines: content.split('\n').length,
      });
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

function checkLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let shouldDouble = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = Number(digits[i]);
    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    shouldDouble = !shouldDouble;
  }
  return sum % 10 === 0;
}

function checkExpiry(expiry: string): { valid: boolean; reason?: string } {
  const match = expiry.trim().match(/^(\d{2})\s*\/\s*(\d{2})$/);
  if (!match) return { valid: false, reason: 'Expected MM/YY format' };
  const month = Number(match[1]);
  const year = 2000 + Number(match[2]);
  if (month < 1 || month > 12) return { valid: false, reason: 'Month must be between 01 and 12' };

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;
  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, reason: 'Card expiry date is in the past' };
  }
  return { valid: true };
}

function checkVpa(vpa: string): { valid: boolean; reason?: string } {
  const trimmed = vpa.trim();
  if (!trimmed.includes('@')) return { valid: false, reason: 'Missing @ handle separator' };
  const [userPart, handlePart] = trimmed.split('@');
  if (!userPart || !handlePart) return { valid: false, reason: 'Incomplete UPI handle' };
  if (handlePart.toLowerCase() === 'invalid' || handlePart.length < 2) {
    return { valid: false, reason: 'Unrecognized PSP handle (@invalid rejected by Razorpay)' };
  }
  const validPattern = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, reason: 'Invalid characters in UPI ID' };
  }
  return { valid: true };
}

async function createZipBuffer(): Promise<Buffer> {
  const zip = new JSZip();
  const rootFolder = zip.folder('razorpay-playwright-automation');
  if (!rootFolder) throw new Error('Failed to initialize ZIP archive');

  const files = collectAutomationFiles(AUTOMATION_DIR);
  for (const file of files) {
    rootFolder.file(file.path, file.content);
  }

  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

interface DemoTransaction {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  method: 'card' | 'upi' | 'netbanking';
  detail: string;
  status: '2fa_pending' | 'captured' | 'failed';
  createdAt: string;
}

const demoTransactions: DemoTransaction[] = [];

function randomId(prefix: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 14; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${out}`;
}

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.get('/api/transactions', (_req, res) => {
    res.json({ transactions: demoTransactions.slice(0, 20) });
  });

  app.post('/v1/standard_checkout/payments/create/ajax', (req, res) => {
    const body = (req.body || {}) as Record<string, string | number>;
    const method = (String(body.method || 'card').toLowerCase() as 'card' | 'upi' | 'netbanking');
    const amount = Number(body.amount) || 100;

    if (method === 'card') {
      const cardNumber = String(body['card[number]'] ?? body.cardNumber ?? '');
      const expiry = String(body['card[expiry]'] ?? body.cardExpiry ?? '');
      if (!checkLuhn(cardNumber)) {
        res.status(400).json({ error: { description: 'Enter a valid card number' } });
        return;
      }
      if (!checkExpiry(expiry).valid) {
        res.status(400).json({ error: { description: 'Enter a valid expiry date' } });
        return;
      }
    }

    if (method === 'upi') {
      const vpa = String(body.vpa || '');
      if (!checkVpa(vpa).valid) {
        res.status(400).json({ error: { description: 'Please enter a valid UPI ID' } });
        return;
      }
    }

    const paymentId = randomId('pay');
    const orderId = randomId('order');
    let detail = 'Card •••• 1111';
    if (method === 'card') {
      const num = String(body['card[number]'] ?? body.cardNumber ?? '').replace(/\D/g, '');
      detail = `Card •••• ${num.slice(-4) || '1111'}`;
    } else if (method === 'upi') {
      detail = String(body.vpa || 'success@razorpay');
    } else if (method === 'netbanking') {
      detail = `${String(body.bank || 'HDFC')} NetBanking`;
    }

    const tx: DemoTransaction = {
      id: paymentId,
      orderId,
      amount,
      currency: 'INR',
      method,
      detail,
      status: '2fa_pending',
      createdAt: new Date().toISOString(),
    };
    demoTransactions.unshift(tx);

    res.status(200).json({
      status: 'created',
      amount,
      currency: 'INR',
      method,
      order_id: orderId,
      razorpay_payment_id: paymentId,
      payment: {
        id: paymentId,
        order_id: orderId,
        amount,
        currency: 'INR',
        method,
        status: 'created',
      },
      demo_otp: '482916',
    });
  });

  app.post('/api/bank-acs/verify-otp', (req, res) => {
    const { paymentId = '', otp = '' } = (req.body || {}) as Record<string, string>;
    if (!/^\d{6}$/.test(String(otp).trim())) {
      res.status(400).json({ success: false, message: 'Enter a valid 6-digit OTP' });
      return;
    }
    const tx = demoTransactions.find((t) => t.id === paymentId);
    if (tx) tx.status = 'captured';

    res.json({
      success: true,
      paymentId: paymentId || randomId('pay'),
      amount: tx?.amount || 100,
      status: 'captured',
    });
  });

  app.post('/api/upi/approve', (req, res) => {
    const { paymentId = '' } = (req.body || {}) as Record<string, string>;
    const tx = demoTransactions.find((t) => t.id === paymentId);
    if (tx) tx.status = 'captured';

    res.json({
      success: true,
      paymentId: paymentId || randomId('pay'),
      amount: tx?.amount || 100,
      status: 'captured',
    });
  });

  app.post('/api/netbanking/authorize', (req, res) => {
    const { paymentId = '', customerId = '', password = '' } = (req.body || {}) as Record<string, string>;
    if (!customerId.trim() || !password.trim()) {
      res.status(400).json({ success: false, message: 'Customer ID and Password are required' });
      return;
    }
    const tx = demoTransactions.find((t) => t.id === paymentId);
    if (tx) tx.status = 'captured';

    res.json({
      success: true,
      paymentId: paymentId || randomId('pay'),
      amount: tx?.amount || 100,
      status: 'captured',
    });
  });

  app.get('/api/automation-files', (_req, res) => {
    try {
      const files = collectAutomationFiles(AUTOMATION_DIR);
      res.json({ files });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to read automation files' });
    }
  });

  app.get('/api/download-repo', async (_req, res) => {
    try {
      const buffer = await createZipBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="razorpay-playwright-automation.zip"');
      res.send(buffer);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unable to build repository ZIP' });
    }
  });

  const httpServer = http.createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });

    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (result?.code) {
          const safeCode = result.code
            .replace(/transport\.connect\(createHMRHandler\(handleMessage\)\)/g, 'Promise.resolve()')
            .replace(/setupForwardConsoleHandler\(transport,\s*forwardConsole\)/g, 'void 0');
          res.type('application/javascript').send(safeCode);
          return;
        }
      } catch {
        // Fall through to Vite middleware
      }
      next();
    });

    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Razorpay Automation Workbench server listening on http://localhost:${PORT}`);
  });
}

startServer();
