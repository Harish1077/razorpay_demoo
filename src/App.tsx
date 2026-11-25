import { useEffect, useState } from 'react';
import { Download, Menu, X } from 'lucide-react';
import { CheckoutIframeApp } from './components/CheckoutIframeApp';
import { LiveDemoCheckoutView } from './components/LiveDemoCheckoutView';
import { CodeExplorerView } from './components/CodeExplorerView';
import { AutomationFile, WorkspaceSection } from './types/automation';

const NAV_ITEMS: Array<{ id: WorkspaceSection; label: string }> = [
  { id: 'live-demo', label: 'Live Checkout' },
  { id: 'code', label: 'Playwright Code' },
];

export default function App() {
  // When mounted inside <iframe src="/checkout-frame">, render only the checkout iframe app
  if (typeof window !== 'undefined' && window.location.pathname === '/checkout-frame') {
    return <CheckoutIframeApp />;
  }

  return <MainShell />;
}

function MainShell() {
  const [section, setSection] = useState<WorkspaceSection>('live-demo');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [files, setFiles] = useState<AutomationFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/automation-files')
      .then((res) => res.json())
      .then((data) => {
        if (active && Array.isArray(data.files)) {
          setFiles(data.files);
        }
      })
      .catch(() => {
        // Keep empty list on failure
      })
      .finally(() => {
        if (active) setFilesLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleDownloadZip = async () => {
    setDownloading(true);
    setDownloadError(null);
    try {
      const response = await fetch('/api/download-repo');
      if (!response.ok) {
        throw new Error('Failed to build automation ZIP archive');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'razorpay-playwright-automation.zip';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-8 flex items-center justify-between gap-8 shrink-0 sticky top-0 z-30">
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            className="lg:hidden p-1.5 -ml-1.5 text-slate-600 hover:text-slate-900"
            aria-label="Toggle navigation"
          >
            {mobileNavOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => setSection('live-demo')}
            className="text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0 cursor-pointer"
          >
            Razorpay Demo
          </button>
        </div>

        <nav className="hidden lg:flex items-center gap-7 text-sm font-medium">
          {NAV_ITEMS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`py-1 whitespace-nowrap shrink-0 transition-colors border-b-2 cursor-pointer ${
                  active
                    ? 'text-blue-700 border-blue-700'
                    : 'text-slate-600 border-transparent hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="flex items-center shrink-0">
          <button
            type="button"
            onClick={handleDownloadZip}
            disabled={downloading}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Preparing...' : 'Download Repo (.zip)'}</span>
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <nav className="lg:hidden bg-white border-b border-slate-200 px-4 py-3 flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  setMobileNavOpen(false);
                }}
                className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium ${
                  active ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
      )}

      <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto space-y-6">
        {downloadError && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
            {downloadError}
          </div>
        )}

        {section === 'live-demo' && (
          <LiveDemoCheckoutView onOpenSpecs={() => setSection('code')} />
        )}

        {section === 'code' && (
          <CodeExplorerView files={files} loading={filesLoading} />
        )}
      </main>
    </div>
  );
}
