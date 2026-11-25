import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  Building2,
  Check,
  Copy,
  CreditCard,
  Loader2,
  Lock,
  QrCode,
  Search,
  ShieldAlert,
  Smartphone,
  X,
} from 'lucide-react';

type MethodTab = 'card' | 'upi' | 'netbanking';
type CheckoutStage =
  | 'method-select'
  | 'bank-3ds-otp'
  | 'upi-2fa'
  | 'netbanking-portal'
  | 'payment-success';

function passesLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let dbl = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = Number(digits[i]);
    if (dbl) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    dbl = !dbl;
  }
  return sum % 10 === 0;
}

function detectCardBrand(cardNumber: string): string {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.startsWith('4')) return 'VISA';
  if (/^(5[1-5]|2[2-7])/.test(digits)) return 'MASTERCARD';
  if (/^(60|65|81|82|508)/.test(digits)) return 'RUPAY';
  if (/^3[47]/.test(digits)) return 'AMEX';
  return '';
}

function isExpiryValid(expiry: string): boolean {
  const match = expiry.trim().match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!match) return false;
  const month = Number(match[1]);
  const rawYear = match[2];
  const year = rawYear.length === 4 ? Number(rawYear) : 2000 + Number(rawYear);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  return year > curY || (year === curY && month >= curM);
}

function isVpaValid(vpa: string): boolean {
  const trimmed = vpa.trim();
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;
  if (!parts[0] || !parts[1] || parts[1].toLowerCase() === 'invalid') return false;
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9]{2,64}$/.test(trimmed);
}

function generateFallbackPaymentId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 14; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `pay_${out}`;
}

interface JsonPostResult {
  ok: boolean;
  status: number;
  data: Record<string, unknown> | null;
  timedOut: boolean;
}

async function postJsonWithTimeout(
  url: string,
  payload: Record<string, unknown>,
  timeoutMs = 1200
): Promise<JsonPostResult> {
  const controller = new AbortController();
  let timerId: number | undefined;

  const timeoutPromise = new Promise<JsonPostResult>((resolve) => {
    timerId = window.setTimeout(() => {
      try {
        controller.abort();
      } catch {
        // Ignore abort errors
      }
      resolve({ ok: false, status: 0, data: null, timedOut: true });
    }, timeoutMs);
  });

  const fetchPromise = (async (): Promise<JsonPostResult> => {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';
      let data: Record<string, unknown> | null = null;
      if (contentType.includes('application/json')) {
        data = (await res.json()) as Record<string, unknown>;
      }
      return { ok: res.ok, status: res.status, data, timedOut: false };
    } catch {
      return { ok: false, status: 0, data: null, timedOut: false };
    } finally {
      if (timerId !== undefined) window.clearTimeout(timerId);
    }
  })();

  return Promise.race([fetchPromise, timeoutPromise]);
}

const BANKS = [
  { code: 'HDFC', name: 'HDFC Bank', short: 'HD' },
  { code: 'SBI', name: 'State Bank of India', short: 'SB' },
  { code: 'ICICI', name: 'ICICI Bank', short: 'IC' },
  { code: 'AXIS', name: 'Axis Bank', short: 'AX' },
  { code: 'KOTAK', name: 'Kotak Mahindra Bank', short: 'KT' },
];

const STAGE_TRANSITION = {
  duration: 0.18,
  ease: [0.16, 1, 0.3, 1] as const,
};

export function CheckoutIframeApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const amountPaise = Number(params.get('amount')) || 100;
  const formattedAmount = `₹${(amountPaise / 100).toFixed(2)}`;

  const [contact, setContact] = useState(params.get('contact') || '9876543210');
  const [email, setEmail] = useState(params.get('email') || 'qa.automation@example.com');
  const [method, setMethod] = useState<MethodTab>('card');
  const [stage, setStage] = useState<CheckoutStage>('method-select');

  // Card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardName, setCardName] = useState('');

  // UPI state
  const [vpa, setVpa] = useState('');
  const [upiSecondsLeft, setUpiSecondsLeft] = useState(300);
  const [upiAutoApproveSec, setUpiAutoApproveSec] = useState(3);

  // NetBanking state
  const [bankSearch, setBankSearch] = useState('');
  const [selectedBank, setSelectedBank] = useState('HDFC');
  const [nbCustomerId, setNbCustomerId] = useState('CUST104829');
  const [nbPassword, setNbPassword] = useState('');

  // Active payment & 2FA / Success state
  const [activePaymentId, setActivePaymentId] = useState('');
  const [otpInput, setOtpInput] = useState('');
  const [copiedDemoOtp, setCopiedDemoOtp] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [successInfo, setSuccessInfo] = useState<{
    paymentId: string;
    method: MethodTab;
    detail: string;
  } | null>(null);

  const upiApprovedRef = useRef(false);

  const handleCopyDemoOtp = async () => {
    try {
      await navigator.clipboard.writeText('482916');
    } catch {
      const temp = document.createElement('textarea');
      temp.value = '482916';
      temp.style.position = 'fixed';
      temp.style.opacity = '0';
      document.body.appendChild(temp);
      temp.select();
      document.execCommand('copy');
      temp.remove();
    }
    setCopiedDemoOtp(true);
    window.setTimeout(() => setCopiedDemoOtp(false), 1800);
  };

  const broadcastEvent = useCallback((payload: Record<string, unknown>) => {
    try {
      window.parent.postMessage(payload, '*');
    } catch {
      // Ignore cross-origin parent restriction if standalone
    }
    try {
      const channel = new BroadcastChannel('razorpay_checkout_events');
      channel.postMessage(payload);
      channel.close();
    } catch {
      // Ignore BroadcastChannel unavailable
    }
  }, []);

  const notifyParentClose = useCallback(() => {
    broadcastEvent({ type: 'RAZORPAY_CHECKOUT_CLOSE' });
  }, [broadcastEvent]);

  const completePaymentAndShowSuccess = useCallback(
    (paymentId: string, usedMethod: MethodTab, detail: string) => {
      setSuccessInfo({ paymentId, method: usedMethod, detail });
      setStage('payment-success');
      broadcastEvent({
        type: 'RAZORPAY_PAYMENT_RECORDED',
        paymentId,
        amount: amountPaise,
        method: usedMethod,
        detail,
      });
      window.setTimeout(() => {
        broadcastEvent({
          type: 'RAZORPAY_PAYMENT_SUCCESS',
          paymentId,
          amount: amountPaise,
          method: usedMethod,
          detail,
        });
      }, 2000);
    },
    [amountPaise, broadcastEvent]
  );

  const handleSimulateUpiApprove = useCallback(async () => {
    if (upiApprovedRef.current) return;
    upiApprovedRef.current = true;
    setSubmitting(true);
    const paymentId = activePaymentId || generateFallbackPaymentId();
    const cleanVpa = vpa.trim() || 'success@razorpay';

    const result = await postJsonWithTimeout('/api/upi/approve', { paymentId }, 1200);
    setSubmitting(false);
    const resolvedId =
      result.ok && typeof result.data?.paymentId === 'string' ? result.data.paymentId : paymentId;
    completePaymentAndShowSuccess(resolvedId, 'upi', cleanVpa);
  }, [activePaymentId, completePaymentAndShowSuccess, vpa]);

  const upiApproveRef = useRef(handleSimulateUpiApprove);
  upiApproveRef.current = handleSimulateUpiApprove;

  useEffect(() => {
    if (stage !== 'upi-2fa') return;
    upiApprovedRef.current = false;
    setUpiAutoApproveSec(3);

    const timer = window.setInterval(() => {
      setUpiSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
      setUpiAutoApproveSec((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const autoApproveTimer = window.setTimeout(() => {
      void upiApproveRef.current();
    }, 3000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(autoApproveTimer);
    };
  }, [stage]);

  const createPaymentAjax = async (payload: Record<string, string | number>) => {
    const result = await postJsonWithTimeout(
      '/v1/standard_checkout/payments/create/ajax',
      {
        amount: amountPaise,
        currency: 'INR',
        contact,
        email,
        ...payload,
      },
      1200
    );

    if (result.status === 400 && result.data) {
      const errObj = result.data.error as { description?: string } | undefined;
      throw new Error(errObj?.description || 'Invalid payment details');
    }

    if (result.ok && result.data && typeof result.data.razorpay_payment_id === 'string') {
      return {
        razorpay_payment_id: result.data.razorpay_payment_id,
        amount: Number(result.data.amount) || amountPaise,
      };
    }

    return {
      razorpay_payment_id: generateFallbackPaymentId(),
      amount: amountPaise,
    };
  };

  const handleExpiryInput = (raw: string) => {
    const cleaned = raw.replace(/[^\d/]/g, '');
    if (cleaned.length === 2 && cardExpiry.length === 1 && !cleaned.includes('/')) {
      setCardExpiry(`${cleaned}/`);
    } else if (/^\d{4}$/.test(cleaned)) {
      setCardExpiry(`${cleaned.slice(0, 2)}/${cleaned.slice(2)}`);
    } else {
      setCardExpiry(cleaned.slice(0, 7));
    }
  };

  const handleCardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!passesLuhn(cardNumber)) {
      setErrorMessage('Enter a valid card number');
      return;
    }
    if (!isExpiryValid(cardExpiry)) {
      setErrorMessage('Enter a valid expiry date');
      return;
    }
    if (!/^\d{3,4}$/.test(cardCvv.trim())) {
      setErrorMessage('Enter a valid 3 or 4 digit CVV');
      return;
    }

    setSubmitting(true);
    try {
      const [data] = await Promise.all([
        createPaymentAjax({
          method: 'card',
          'card[number]': cardNumber,
          'card[expiry]': cardExpiry,
          'card[cvv]': cardCvv,
          'card[name]': cardName,
        }),
        new Promise((resolve) => window.setTimeout(resolve, 420)),
      ]);
      setActivePaymentId(data.razorpay_payment_id);
      setOtpInput('');
      setStage('bank-3ds-otp');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Unable to process card');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!isVpaValid(vpa)) {
      setErrorMessage('Please enter a valid UPI ID');
      return;
    }

    setSubmitting(true);
    try {
      const [data] = await Promise.all([
        createPaymentAjax({
          method: 'upi',
          vpa: vpa.trim(),
        }),
        new Promise((resolve) => window.setTimeout(resolve, 420)),
      ]);
      setActivePaymentId(data.razorpay_payment_id);
      setUpiSecondsLeft(300);
      setStage('upi-2fa');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Invalid UPI VPA');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNetBankingSelect = async (bankCode: string) => {
    setErrorMessage(null);
    setSelectedBank(bankCode);
    setSubmitting(true);
    try {
      const [data] = await Promise.all([
        createPaymentAjax({
          method: 'netbanking',
          bank: bankCode,
        }),
        new Promise((resolve) => window.setTimeout(resolve, 420)),
      ]);
      setActivePaymentId(data.razorpay_payment_id);
      setStage('netbanking-portal');
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Bank gateway unavailable');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanedOtp = otpInput.replace(/\s+/g, '');
    if (!/^\d{6}$/.test(cleanedOtp)) {
      setErrorMessage('Enter a valid 6-digit OTP');
      return;
    }

    setSubmitting(true);
    const paymentId = activePaymentId || generateFallbackPaymentId();
    const digits = cardNumber.replace(/\D/g, '');
    const cardDetail = `Card •••• ${digits.slice(-4) || '1111'}`;

    try {
      const [result] = await Promise.all([
        postJsonWithTimeout('/api/bank-acs/verify-otp', { paymentId, otp: cleanedOtp }, 1200),
        new Promise((resolve) => window.setTimeout(resolve, 380)),
      ]);

      if (result.status === 400 && result.data) {
        setErrorMessage(String(result.data.message || 'Invalid OTP'));
        return;
      }

      const resolvedId =
        result.ok && typeof result.data?.paymentId === 'string' ? result.data.paymentId : paymentId;
      completePaymentAndShowSuccess(resolvedId, 'card', cardDetail);
    } finally {
      setSubmitting(false);
    }
  };

  const handleNetBankingLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    if (!nbCustomerId.trim() || !nbPassword.trim()) {
      setErrorMessage('Customer ID and Password are required');
      return;
    }

    setSubmitting(true);
    const paymentId = activePaymentId || generateFallbackPaymentId();
    const nbDetail = `${selectedBank} NetBanking`;

    try {
      const [result] = await Promise.all([
        postJsonWithTimeout(
          '/api/netbanking/authorize',
          {
            paymentId,
            customerId: nbCustomerId,
            password: nbPassword,
          },
          1200
        ),
        new Promise((resolve) => window.setTimeout(resolve, 380)),
      ]);

      const resolvedId =
        result.ok && typeof result.data?.paymentId === 'string' ? result.data.paymentId : paymentId;
      completePaymentAndShowSuccess(resolvedId, 'netbanking', nbDetail);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBanks = BANKS.filter(
    (b) =>
      b.code.toLowerCase().includes(bankSearch.toLowerCase()) ||
      b.name.toLowerCase().includes(bankSearch.toLowerCase())
  );

  const cardBrand = detectCardBrand(cardNumber);
  const minutesStr = String(Math.floor(upiSecondsLeft / 60)).padStart(2, '0');
  const secondsStr = String(upiSecondsLeft % 60).padStart(2, '0');

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center p-0 sm:p-2">
      <div className="w-full max-w-[420px] bg-white sm:rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col">
        {/* Classic Razorpay Deep Navy Checkout Header */}
        <div className="bg-[#0B2559] text-white px-5 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {stage !== 'method-select' && stage !== 'payment-success' ? (
              <button
                type="button"
                onClick={() => {
                  setStage('method-select');
                  setErrorMessage(null);
                  setSubmitting(false);
                }}
                aria-label="Back to payment methods"
                className="p-1.5 rounded-md bg-white/10 text-blue-100 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-lg bg-white text-[#0B2559] font-bold text-sm flex items-center justify-center shrink-0">
                R
              </div>
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">Razorpay Demo Store</div>
              <div className="text-xs text-blue-200 truncate">Razorpay Trusted Business</div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <span className="text-lg font-mono font-bold tabular-nums">{formattedAmount}</span>
            <button
              type="button"
              onClick={notifyParentClose}
              aria-label="Close checkout"
              className="p-1 text-blue-200 hover:text-white transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Contact Summary Bar */}
        {stage === 'method-select' && (
          <div className="px-5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2 text-xs text-slate-600">
            <span className="font-medium text-slate-700 shrink-0">Contact:</span>
            <input
              type="tel"
              name="contact"
              aria-label="Mobile number"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              className="w-24 bg-transparent font-mono text-slate-900 focus:outline-none border-b border-transparent focus:border-blue-600"
            />
            <span className="text-slate-300">·</span>
            <input
              type="email"
              name="email"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="min-w-0 flex-1 bg-transparent text-slate-600 focus:outline-none border-b border-transparent focus:border-blue-600 truncate"
            />
          </div>
        )}

        {/* Animated Stage Switcher */}
        <div className="relative overflow-hidden">
          {/* Stage 1: Payment Methods */}
          {stage === 'method-select' && (
            <motion.div
              key="stage-method-select"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={STAGE_TRANSITION}
              className="p-5 space-y-5"
            >
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg">
                  <button
                    type="button"
                    data-value="card"
                    onClick={() => {
                      setMethod('card');
                      setErrorMessage(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      method === 'card'
                        ? 'bg-white text-[#0B2559] shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card</span>
                  </button>

                  <button
                    type="button"
                    data-value="upi"
                    onClick={() => {
                      setMethod('upi');
                      setErrorMessage(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      method === 'upi'
                        ? 'bg-white text-[#0B2559] shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI</span>
                  </button>

                  <button
                    type="button"
                    data-value="netbanking"
                    onClick={() => {
                      setMethod('netbanking');
                      setErrorMessage(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      method === 'netbanking'
                        ? 'bg-white text-[#0B2559] shadow-xs font-semibold'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Building2 className="w-3.5 h-3.5" />
                    <span>Netbanking</span>
                  </button>
                </div>

                {errorMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="alert"
                    className="error flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800"
                  >
                    <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </motion.div>
                )}

                {method === 'card' && (
                  <motion.form
                    key="method-card"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={STAGE_TRANSITION}
                      onSubmit={handleCardSubmit}
                      className="space-y-3.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-medium text-slate-700">Card Number</label>
                          <button
                            type="button"
                            onClick={() => {
                              setCardNumber('4111 1111 1111 1111');
                              setCardExpiry('12/28');
                              setCardCvv('123');
                              setCardName('QA Automation');
                              setErrorMessage(null);
                            }}
                            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Fill test card
                          </button>
                        </div>
                        <div className="relative">
                          <input
                            type="text"
                            name="card[number]"
                            autoComplete="cc-number"
                            placeholder="Card Number"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            className="w-full px-3 py-2.5 pr-20 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                          />
                          {cardBrand && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono font-semibold text-blue-800">
                              {cardBrand}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-slate-700">Expiry</label>
                          <input
                            type="text"
                            name="card[expiry]"
                            autoComplete="cc-exp"
                            placeholder="MM / YY"
                            value={cardExpiry}
                            onChange={(e) => handleExpiryInput(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-xs font-medium text-slate-700">CVV</label>
                          <input
                            type="password"
                            name="card[cvv]"
                            autoComplete="cc-csc"
                            placeholder="CVV"
                            maxLength={4}
                            value={cardCvv}
                            onChange={(e) => setCardCvv(e.target.value)}
                            className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-medium text-slate-700">Card Holder&apos;s Name</label>
                        <input
                          type="text"
                          name="card[name]"
                          autoComplete="cc-name"
                          placeholder="Name on Card"
                          value={cardName}
                          onChange={(e) => setCardName(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 px-4 bg-[#1A63FF] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                        <span>{submitting ? 'Processing...' : `Pay ${formattedAmount}`}</span>
                      </button>
                    </motion.form>
                  )}

                  {method === 'upi' && (
                    <motion.form
                      key="method-upi"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={STAGE_TRANSITION}
                      onSubmit={handleUpiSubmit}
                      className="space-y-4"
                    >
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center gap-3.5">
                        <div className="w-14 h-14 bg-white border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                          <QrCode className="w-9 h-9 text-slate-800" />
                        </div>
                        <div className="text-xs space-y-0.5">
                          <div className="font-semibold text-slate-900">UPI ID / QR Payment</div>
                          <div className="text-slate-500">
                            Enter your VPA below to trigger the 2FA Collect &amp; QR approval flow.
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-xs font-medium text-slate-700">UPI ID / VPA</label>
                          <button
                            type="button"
                            onClick={() => {
                              setVpa('success@razorpay');
                              setErrorMessage(null);
                            }}
                            className="text-xs font-medium text-blue-700 hover:underline cursor-pointer"
                          >
                            Use success@razorpay
                          </button>
                        </div>
                        <input
                          type="text"
                          name="vpa"
                          placeholder="example@okaxis"
                          value={vpa}
                          onChange={(e) => setVpa(e.target.value)}
                          className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={submitting}
                        className="w-full py-3 px-4 bg-[#1A63FF] hover:bg-blue-700 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                        <span>{submitting ? 'Verifying VPA...' : `Verify and Pay ${formattedAmount}`}</span>
                      </button>
                    </motion.form>
                  )}

                  {method === 'netbanking' && (
                    <motion.div
                      key="method-netbanking"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={STAGE_TRANSITION}
                      className="space-y-3"
                    >
                      <div className="relative">
                        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="search"
                          placeholder="Search for banks"
                          value={bankSearch}
                          onChange={(e) => setBankSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                        />
                      </div>

                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {filteredBanks.map((bank) => {
                          const isLoadingThisBank = submitting && selectedBank === bank.code;
                          return (
                            <button
                              key={bank.code}
                              type="button"
                              data-value={bank.code}
                              disabled={submitting}
                              onClick={() => handleNetBankingSelect(bank.code)}
                              className="w-full flex items-center justify-between px-3.5 py-2.5 border border-slate-200 rounded-lg hover:bg-blue-50/60 hover:border-blue-300 disabled:opacity-60 transition-colors text-left cursor-pointer"
                            >
                              <span className="flex items-center gap-2.5">
                                <span className="w-7 h-7 rounded-md bg-slate-100 text-[#0B2559] text-xs font-mono font-semibold flex items-center justify-center">
                                  {bank.short}
                                </span>
                                <span className="text-xs font-medium text-slate-900">{bank.name}</span>
                              </span>
                              <span className="inline-flex items-center gap-1.5 text-xs font-mono text-slate-500">
                                {isLoadingThisBank && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-700" />}
                                <span>{bank.code}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
              </motion.div>
            )}

            {/* Stage 2A: Bank 3DS ACS OTP Screen */}
            {stage === 'bank-3ds-otp' && (
              <motion.form
                key="stage-bank-3ds"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={STAGE_TRANSITION}
                onSubmit={handleVerifyOtp}
                className="p-5 space-y-4"
              >
                <div className="p-3.5 bg-slate-900 text-white rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-300">3D Secure Bank ACS</div>
                    <div className="text-sm font-semibold">One Time Password</div>
                  </div>
                  <div className="text-base font-mono font-bold tabular-nums">{formattedAmount}</div>
                </div>

                {errorMessage && (
                  <div role="alert" className="error p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    {errorMessage}
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-700">
                    Enter OTP sent to your registered mobile
                  </label>
                  <input
                    type="text"
                    name="otp"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    value={otpInput}
                    onChange={(e) => setOtpInput(e.target.value)}
                    className="w-full px-3 py-2.5 text-sm font-mono tracking-widest border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <p className="text-xs text-slate-500">
                      Demo ACS OTP: <code className="font-mono font-semibold text-slate-800">482916</code>
                    </p>
                    <button
                      type="button"
                      onClick={handleCopyDemoOtp}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {copiedDemoOtp ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-700" />
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3.5 h-3.5" />
                          <span>Copy Demo OTP</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-[#0B2559] hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span>{submitting ? 'Verifying OTP...' : 'Submit OTP'}</span>
                </button>
              </motion.form>
            )}

            {/* Stage 2B: UPI Collect Timer / QR 2FA Screen */}
            {stage === 'upi-2fa' && (
              <motion.div
                key="stage-upi-2fa"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={STAGE_TRANSITION}
                className="p-5 space-y-4 text-center"
              >
                <div className="mx-auto w-32 h-32 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
                  <QrCode className="w-20 h-20 text-slate-900" />
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-semibold text-slate-900">Approve payment on your UPI app</div>
                  <div className="text-xs text-slate-600">
                    Collect request sent to <span className="font-mono text-slate-900">{vpa}</span> for{' '}
                    <span className="font-mono font-semibold text-slate-900">{formattedAmount}</span>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="py-2 px-3 bg-amber-50 border border-amber-200 rounded-lg text-xs font-mono font-semibold text-amber-800 tabular-nums">
                    Complete your payment in {minutesStr}:{secondsStr} minutes
                  </div>

                  {/* Smooth compositor-only scaleX progress bar */}
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: 3, ease: 'linear' }}
                      style={{ transformOrigin: 'left' }}
                      className="w-full h-full bg-emerald-600"
                    />
                  </div>
                  <div className="text-xs font-medium text-emerald-700 font-mono tabular-nums">
                    {upiAutoApproveSec > 0
                      ? `Auto-confirming UPI payment in ${upiAutoApproveSec}s...`
                      : 'Completing UPI payment...'}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleSimulateUpiApprove()}
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  <span>{submitting ? 'Confirming...' : `Approve Now (${formattedAmount})`}</span>
                </button>
              </motion.div>
            )}

            {/* Stage 2C: NetBanking Bank Login / 2FA Portal */}
            {stage === 'netbanking-portal' && (
              <motion.form
                key="stage-netbanking"
                initial={{ opacity: 0, x: 18 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -18 }}
                transition={STAGE_TRANSITION}
                onSubmit={handleNetBankingLogin}
                className="p-5 space-y-4"
              >
                <div className="p-3.5 bg-slate-800 text-white rounded-lg flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-300">NetBanking 2FA Portal</div>
                    <div className="text-sm font-semibold">{selectedBank} Bank Retail Login</div>
                  </div>
                  <div className="text-base font-mono font-bold tabular-nums">{formattedAmount}</div>
                </div>

                {errorMessage && (
                  <div role="alert" className="error p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
                    {errorMessage}
                  </div>
                )}

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">Customer ID / User ID</label>
                    <input
                      type="text"
                      value={nbCustomerId}
                      onChange={(e) => setNbCustomerId(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-700">Password / IPIN</label>
                    <input
                      type="password"
                      placeholder="Enter any demo password"
                      value={nbPassword}
                      onChange={(e) => setNbPassword(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2.5 px-4 bg-[#0B2559] hover:bg-slate-900 disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  {submitting && <Loader2 className="w-4 h-4 animate-spin shrink-0" />}
                  <span>{submitting ? 'Authorizing...' : `Login & Pay ${formattedAmount}`}</span>
                </button>
              </motion.form>
            )}

            {/* Stage 3: Animated Razorpay Signature Checkmark Confirmation */}
            {stage === 'payment-success' && successInfo && (
              <motion.div
                key="stage-payment-success"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="p-6 text-center space-y-4"
              >
                <div className="relative w-20 h-20 mx-auto flex items-center justify-center">
                  <motion.span
                    aria-hidden="true"
                    initial={{ scale: 0.72, opacity: 0.65 }}
                    animate={{ scale: 1.5, opacity: 0 }}
                    transition={{
                      duration: 1.5,
                      repeat: Infinity,
                      repeatDelay: 0.5,
                      ease: 'easeOut',
                    }}
                    className="absolute inset-2 rounded-full bg-emerald-400/25 border border-emerald-400/50 pointer-events-none"
                  />
                  <motion.span
                    aria-hidden="true"
                    initial={{ scale: 0.72, opacity: 0.5 }}
                    animate={{ scale: 1.72, opacity: 0 }}
                    transition={{
                      duration: 1.5,
                      delay: 0.32,
                      repeat: Infinity,
                      repeatDelay: 0.5,
                      ease: 'easeOut',
                    }}
                    className="absolute inset-2 rounded-full border border-emerald-300/60 pointer-events-none"
                  />
                  <motion.div
                    initial={{ scale: 0.82, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                    className="relative z-10 w-16 h-16 flex items-center justify-center"
                  >
                    <svg viewBox="0 0 56 56" className="w-16 h-16">
                      <motion.circle
                        cx="28"
                        cy="28"
                        r="25"
                        fill="#ECFDF5"
                        stroke="#059669"
                        strokeWidth="3"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                      />
                      <motion.path
                        d="M17 29 L24.5 36 L39 20.5"
                        fill="none"
                        stroke="#059669"
                        strokeWidth="3.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3, delay: 0.25, ease: 'easeOut' }}
                      />
                    </svg>
                  </motion.div>
                </div>

                <div className="space-y-1">
                  <div className="text-lg font-bold text-slate-900">Paid successfully!</div>
                  <div className="text-xs font-medium text-emerald-700">Thanks for your order!</div>
                </div>

                <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs text-left">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Amount Paid</span>
                    <span className="font-mono font-semibold text-slate-900 tabular-nums">{formattedAmount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Transaction ID</span>
                    <span className="font-mono font-semibold text-slate-900">{successInfo.paymentId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Method</span>
                    <span className="font-mono uppercase text-slate-700">{successInfo.method}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    broadcastEvent({
                      type: 'RAZORPAY_PAYMENT_SUCCESS',
                      paymentId: successInfo.paymentId,
                      amount: amountPaise,
                      method: successInfo.method,
                      detail: successInfo.detail,
                    })
                  }
                  className="w-full py-2.5 px-4 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  Done &amp; View Receipt
                </button>
              </motion.div>
            )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Lock className="w-3 h-3" />
            <span>Secured by Razorpay</span>
          </span>
          <span className="font-mono">{formattedAmount} Demo</span>
        </div>
      </div>
    </div>
  );
}
