import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowRight,
  Building2,
  CreditCard,
  Lock,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  X,
} from 'lucide-react';

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

interface LiveDemoCheckoutViewProps {
  onOpenSpecs: () => void;
}

const DEMO_PRODUCTS = [
  { id: 'verify', label: '₹1.00 Verification', amount: 100, desc: 'Standard ₹1.00 (100 paise) checkout demo' },
  { id: 'starter', label: '₹49.00 Sample Plan', amount: 4900, desc: 'Test higher-value INR checkout flow' },
] as const;

export function LiveDemoCheckoutView({ onOpenSpecs }: LiveDemoCheckoutViewProps) {
  const [contact, setContact] = useState('9876543210');
  const [email, setEmail] = useState('qa.automation@example.com');
  const [selectedAmount, setSelectedAmount] = useState<number>(100);
  const [modalOpen, setModalOpen] = useState(false);
  const [lastOrder, setLastOrder] = useState<{ paymentId: string; amount: number; method: string; detail?: string } | null>(null);
  const [transactions, setTransactions] = useState<DemoTransaction[]>([]);
  const [loadingTx, setLoadingTx] = useState(true);

  const formattedSelectedAmount = `₹${(selectedAmount / 100).toFixed(2)}`;

  const fetchTransactions = useCallback(async () => {
    try {
      const res = await fetch('/api/transactions');
      if (res.ok) {
        const data = await res.json();
        setTransactions(data.transactions || []);
      }
    } finally {
      setLoadingTx(false);
    }
  }, []);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  useEffect(() => {
    const processEvent = (payload: Record<string, unknown> | null | undefined) => {
      if (!payload || typeof payload.type !== 'string') return;

      if (payload.type === 'RAZORPAY_CHECKOUT_CLOSE') {
        setModalOpen(false);
        void fetchTransactions();
        return;
      }

      if (payload.type === 'RAZORPAY_PAYMENT_RECORDED' || payload.type === 'RAZORPAY_PAYMENT_SUCCESS') {
        const paymentId = String(payload.paymentId || 'pay_DemoSuccess');
        const amount = Number(payload.amount) || selectedAmount || 100;
        const method = (payload.method || 'card') as 'card' | 'upi' | 'netbanking';
        const detail = String(payload.detail || method.toUpperCase());

        setLastOrder({
          paymentId,
          amount,
          method,
          detail,
        });
        setTransactions((prev) => {
          if (prev.some((t) => t.id === paymentId && t.status === 'captured')) return prev;
          const updated: DemoTransaction = {
            id: paymentId,
            orderId: 'order_demo',
            amount,
            currency: 'INR',
            method,
            detail,
            status: 'captured',
            createdAt: new Date().toISOString(),
          };
          return [updated, ...prev.filter((t) => t.id !== paymentId)];
        });

        if (payload.type === 'RAZORPAY_PAYMENT_SUCCESS') {
          setModalOpen(false);
        }
        void fetchTransactions();
      }
    };

    const handleMessage = (event: MessageEvent) => {
      processEvent(event.data as Record<string, unknown>);
    };

    window.addEventListener('message', handleMessage);

    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel('razorpay_checkout_events');
      channel.onmessage = (event) => processEvent(event.data as Record<string, unknown>);
    } catch {
      // BroadcastChannel not supported
    }

    return () => {
      window.removeEventListener('message', handleMessage);
      channel?.close();
    };
  }, [fetchTransactions, selectedAmount]);

  const iframeSrc = `/checkout-frame?amount=${selectedAmount}&contact=${encodeURIComponent(
    contact
  )}&email=${encodeURIComponent(email)}`;

  return (
    <div className="space-y-8">
      {/* Razorpay Demo Storefront Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left 7 Cols: Razorpay Brand Showcase & Payment Methods */}
        <div className="lg:col-span-7 bg-[#0B2559] text-white rounded-xl p-6 sm:p-8 flex flex-col justify-between gap-6 border border-[#143475]">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#1A63FF] text-white font-bold text-sm flex items-center justify-center">
                  R
                </div>
                <span className="text-sm font-semibold tracking-tight text-white">Razorpay Standard Checkout</span>
              </div>
              <span className="text-xs font-mono text-blue-200">Test Mode · INR</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white text-balance">
              Experience smooth Card 3DS, UPI Collect, and NetBanking checkout.
            </h2>

            <p className="text-sm text-blue-100/90 leading-relaxed max-w-xl">
              Launches a live <code className="font-mono text-white">iframe.razorpay-checkout-frame</code> wired to{' '}
              <code className="font-mono text-white">/v1/standard_checkout/payments/create/ajax</code> with Luhn checks,
              Bank ACS OTP (<code className="font-mono text-white">482916</code>), UPI 3-second auto-confirmation, and NetBanking 2FA.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-4 border-t border-white/15">
            <div className="p-3.5 rounded-lg bg-white/8 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <CreditCard className="w-4 h-4 text-blue-300" />
                <span>Cards &amp; 3DS OTP</span>
              </div>
              <p className="text-xs text-blue-100/80">Instant brand detection, Luhn validation &amp; Bank ACS.</p>
            </div>

            <div className="p-3.5 rounded-lg bg-white/8 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Smartphone className="w-4 h-4 text-blue-300" />
                <span>UPI ID &amp; QR</span>
              </div>
              <p className="text-xs text-blue-100/80">VPA verification, QR screen &amp; smooth auto-approval.</p>
            </div>

            <div className="p-3.5 rounded-lg bg-white/8 border border-white/10 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-white">
                <Building2 className="w-4 h-4 text-blue-300" />
                <span>NetBanking 2FA</span>
              </div>
              <p className="text-xs text-blue-100/80">HDFC, SBI, ICICI &amp; Axis retail login simulation.</p>
            </div>
          </div>
        </div>

        {/* Right 5 Cols: Interactive Order & Receipt Card */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 flex flex-col justify-between overflow-hidden">
          <AnimatePresence mode="wait" initial={false}>
            {lastOrder ? (
              <motion.div
                key="order-receipt"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="space-y-5 my-auto"
              >
                <div className="flex items-center gap-3.5">
                  <div className="relative w-14 h-14 shrink-0 flex items-center justify-center">
                    <motion.span
                      aria-hidden="true"
                      initial={{ scale: 0.72, opacity: 0.6 }}
                      animate={{ scale: 1.45, opacity: 0 }}
                      transition={{
                        duration: 1.5,
                        repeat: Infinity,
                        repeatDelay: 0.5,
                        ease: 'easeOut',
                      }}
                      className="absolute inset-1 rounded-full bg-emerald-400/20 border border-emerald-400/50 pointer-events-none"
                    />
                    <motion.div
                      initial={{ scale: 0.85, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 360, damping: 22 }}
                      className="relative z-10 w-12 h-12 flex items-center justify-center"
                    >
                      <svg viewBox="0 0 56 56" className="w-12 h-12">
                        <motion.circle
                          cx="28"
                          cy="28"
                          r="25"
                          fill="#ECFDF5"
                          stroke="#059669"
                          strokeWidth="3"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 0.38, ease: 'easeOut' }}
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
                          transition={{ duration: 0.28, delay: 0.22, ease: 'easeOut' }}
                        />
                      </svg>
                    </motion.div>
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Paid successfully!</h3>
                    <div className="text-xs font-medium text-emerald-700">Thanks for your order!</div>
                  </div>
                </div>

                <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-lg space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Transaction ID</span>
                    <span className="font-mono font-semibold text-slate-900">{lastOrder.paymentId}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Amount Paid</span>
                    <span className="font-mono font-semibold text-emerald-800 tabular-nums">
                      ₹{(lastOrder.amount / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Payment Method</span>
                    <span className="font-mono uppercase text-slate-900">
                      {lastOrder.detail || lastOrder.method}
                    </span>
                  </div>
                </div>

                <motion.button
                  whileTap={{ scale: 0.99 }}
                  type="button"
                  onClick={() => {
                    setLastOrder(null);
                    setModalOpen(true);
                  }}
                  className="w-full py-3 px-4 bg-[#0B2559] hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Start Another {formattedSelectedAmount} Payment</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="order-form"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col justify-between gap-6 h-full"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                    <div>
                      <div className="text-xs text-slate-500">Order #DEMO-{selectedAmount}</div>
                      <div className="text-base font-semibold text-slate-900">Razorpay Checkout Demo</div>
                    </div>
                    <div className="text-2xl font-mono font-bold text-[#0B2559] tabular-nums">
                      {formattedSelectedAmount}
                    </div>
                  </div>

                  {/* Amount Preset Segmented Selector */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-700">Checkout Amount</label>
                    <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-lg">
                      {DEMO_PRODUCTS.map((item) => {
                        const active = selectedAmount === item.amount;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => setSelectedAmount(item.amount)}
                            className={`py-1.5 px-2.5 text-xs rounded-md transition-colors cursor-pointer ${
                              active
                                ? 'bg-white text-[#0B2559] font-semibold shadow-xs'
                                : 'text-slate-600 hover:text-slate-900 font-medium'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Phone Number</label>
                      <input
                        type="tel"
                        value={contact}
                        onChange={(e) => setContact(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-slate-700">Email Receipt</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <motion.button
                    whileTap={{ scale: 0.99 }}
                    id="rzp-button1"
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="razorpay-payment-button w-full py-3 px-4 bg-[#1A63FF] hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Lock className="w-4 h-4" />
                    <span>Pay {formattedSelectedAmount}</span>
                  </motion.button>

                  <div className="flex items-center justify-between text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                      <span>{selectedAmount} paise test mode</span>
                    </span>
                    <button
                      type="button"
                      onClick={onOpenSpecs}
                      className="text-blue-700 hover:underline font-medium cursor-pointer"
                    >
                      View Playwright Specs
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Live Transaction Ledger */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Session Payment Attempts</h3>
            <p className="text-xs text-slate-500">
              Recorded from <code className="font-mono text-slate-700">/v1/standard_checkout/payments/create/ajax</code>
            </p>
          </div>
          <button
            type="button"
            onClick={fetchTransactions}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>

        {loadingTx ? (
          <div className="p-6 text-xs text-slate-500">Loading payment ledger...</div>
        ) : transactions.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No payments initiated yet. Click <strong>Pay {formattedSelectedAmount}</strong> above to test Card 3DS, UPI, or NetBanking.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-2.5 px-6">Payment ID</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Instrument</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-6 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-6 font-mono text-slate-900">{tx.id}</td>
                    <td className="py-3 px-4 uppercase font-mono text-slate-700">{tx.method}</td>
                    <td className="py-3 px-4 text-slate-600">{tx.detail}</td>
                    <td className="py-3 px-4 text-right font-mono text-slate-900 tabular-nums">
                      ₹{(tx.amount / 100).toFixed(2)}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <span
                        className={`font-medium ${
                          tx.status === 'captured' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {tx.status === 'captured' ? 'Paid' : '2FA Pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Smoothly Animated Razorpay Checkout Iframe Modal */}
      <AnimatePresence>
        {modalOpen && (
          <motion.div
            key="razorpay-modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center p-0 sm:p-4"
          >
            <motion.div
              key="razorpay-modal-container"
              initial={{ opacity: 0, scale: 0.96, y: 14 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="relative w-full max-w-[440px] h-[640px] max-h-[95vh] rounded-xl overflow-hidden shadow-2xl bg-transparent"
            >
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close payment modal"
                className="sm:hidden absolute top-2 right-2 z-10 p-1.5 bg-white/90 rounded-full text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
              <iframe
                src={iframeSrc}
                title="Razorpay Standard Checkout"
                className="razorpay-checkout-frame w-full h-full border-0"
              />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
