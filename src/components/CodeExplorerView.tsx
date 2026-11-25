import { useEffect, useMemo, useState } from 'react';
import { Check, Copy, FileCode2, Search } from 'lucide-react';
import { AutomationFile } from '../types/automation';

interface CodeExplorerViewProps {
  files: AutomationFile[];
  loading: boolean;
  initialFilePath?: string | null;
}

const CATEGORY_LABELS: Record<AutomationFile['category'], string> = {
  tests: 'Test Specs',
  pages: 'Page Objects (POM)',
  utils: 'Utilities & Scripts',
  config: 'Config, CI & Docs',
};

export function CodeExplorerView({ files, loading, initialFilePath }: CodeExplorerViewProps) {
  const [selectedPath, setSelectedPath] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (initialFilePath && files.some((f) => f.path === initialFilePath)) {
      setSelectedPath(initialFilePath);
    } else if (!selectedPath && files.length > 0) {
      const preferred = files.find((f) => f.path === 'tests/01-card-2fa.spec.ts') || files[0];
      setSelectedPath(preferred.path);
    }
  }, [files, initialFilePath, selectedPath]);

  const filteredFiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return files;
    return files.filter((f) => f.path.toLowerCase().includes(q));
  }, [files, searchQuery]);

  const groupedFiles = useMemo(() => {
    const order: AutomationFile['category'][] = ['tests', 'pages', 'utils', 'config'];
    return order
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        items: filteredFiles.filter((f) => f.category === cat),
      }))
      .filter((group) => group.items.length > 0);
  }, [filteredFiles]);

  const activeFile = files.find((f) => f.path === selectedPath) || files[0];

  const handleCopyFile = async () => {
    if (!activeFile) return;
    await navigator.clipboard.writeText(activeFile.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="h-5 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="h-96 bg-slate-50 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* Left File Tree */}
      <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-4">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter automation files..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
          />
        </div>

        <div className="space-y-4 overflow-y-auto max-h-[600px]">
          {groupedFiles.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">No files match &quot;{searchQuery}&quot;</div>
          ) : (
            groupedFiles.map((group) => (
              <div key={group.category} className="space-y-1">
                <div className="px-2 text-xs font-semibold text-slate-500">{group.label}</div>
                {group.items.map((file) => {
                  const isActive = activeFile?.path === file.path;
                  return (
                    <button
                      key={file.path}
                      type="button"
                      onClick={() => setSelectedPath(file.path)}
                      className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                        isActive
                          ? 'bg-blue-50 text-blue-800 font-medium'
                          : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <FileCode2 className="w-3.5 h-3.5 shrink-0 opacity-75" />
                        <span className="truncate font-mono">{file.path}</span>
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums shrink-0">{file.lines}L</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Code Viewer */}
      <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
        {activeFile ? (
          <>
            <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-mono text-xs font-medium text-slate-900 truncate">
                  automation/{activeFile.path}
                </span>
                <span className="text-xs text-slate-500 shrink-0">
                  {activeFile.language} · {activeFile.lines} lines
                </span>
              </div>

              <button
                type="button"
                onClick={handleCopyFile}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-700" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy Code'}
              </button>
            </div>

            <div className="bg-slate-950 text-slate-100 p-4 overflow-auto max-h-[620px] flex-1">
              <table className="w-full border-collapse text-xs font-mono leading-relaxed">
                <tbody>
                  {activeFile.content.split('\n').map((line, idx) => (
                    <tr key={idx} className="hover:bg-slate-900/70">
                      <td className="select-none pr-4 text-right text-slate-500 w-10 align-top tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="whitespace-pre text-slate-100">{line || ' '}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-10 text-center text-sm text-slate-500">Select a file from the tree to inspect its code.</div>
        )}
      </div>
    </div>
  );
}
