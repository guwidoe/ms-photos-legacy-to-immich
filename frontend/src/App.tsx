import { useState, useEffect, useCallback } from 'react';
import { 
  Database, 
  Users, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  BarChart3,
  UserPlus,
  GitMerge,
  AlertTriangle,
  Loader2,
  PlusSquare,
  Ghost
} from 'lucide-react';
import { getStatus } from './api';
import type { SystemStatus } from './types';
import { MatchingProvider } from './context/MatchingContext';
import Dashboard from './components/Dashboard';
import Analytics from './components/Analytics';
import TransferNames from './components/TransferNames';
import AssignFaces from './components/AssignFaces';
import MergeClusters from './components/MergeClusters';
import FixIssues from './components/FixIssues';
import CreateFaces from './components/CreateFaces';
import Diagnostics from './components/Diagnostics';

type Tab = 'dashboard' | 'analytics' | 'transfer' | 'assign' | 'create' | 'merge' | 'fix' | 'diagnostics';

const VALID_TABS: Tab[] = ['dashboard', 'analytics', 'transfer', 'assign', 'create', 'merge', 'fix', 'diagnostics'];

function getTabFromHash(): Tab {
  const hash = window.location.hash.slice(1); // Remove #
  if (VALID_TABS.includes(hash as Tab)) {
    return hash as Tab;
  }
  return 'dashboard';
}

function AppContent() {
  const [activeTab, setActiveTab] = useState<Tab>(getTabFromHash);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  // Handle tab change and update URL hash
  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.location.hash = tab;
  }, []);

  // Listen for hash changes (browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      setActiveTab(getTabFromHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const loadStatus = async () => {
    setStatusLoading(true);
    try {
      const data = await getStatus();
      setStatus(data);
    } catch (err) {
      console.error('Failed to load status:', err);
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const tabs = [
    { id: 'dashboard' as Tab, label: 'Dashboard', icon: Database },
    { id: 'analytics' as Tab, label: 'Analytics', icon: BarChart3 },
    { id: 'transfer' as Tab, label: 'Transfer Names', icon: Users },
    { id: 'assign' as Tab, label: 'Assign Faces', icon: UserPlus },
    { id: 'create' as Tab, label: 'Create Faces', icon: PlusSquare },
    { id: 'merge' as Tab, label: 'Merge Clusters', icon: GitMerge },
    { id: 'fix' as Tab, label: 'Fix Issues', icon: AlertTriangle },
    { id: 'diagnostics' as Tab, label: 'Diagnostics', icon: Ghost },
  ];

  const getStatusIcon = (connected: boolean | undefined) => {
    if (statusLoading) return <Loader2 className="w-3 h-3 animate-spin text-neon-purple" />;
    if (connected) return <CheckCircle2 className="w-3 h-3 text-neon-green" />;
    return <XCircle className="w-3 h-3 text-red-500" />;
  };

  return (
    <div className="min-h-screen bg-void-950 bg-grid-pattern">
      {/* Header */}
      <header className="glass border-b border-white/5 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <Users className="w-8 h-8 text-neon-purple" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-neon-cyan rounded-full animate-pulse" />
              </div>
      <div>
                <h1 className="text-xl font-semibold text-white">Face Migration Tool</h1>
                <p className="text-xs text-white/40">Windows Photos → Immich</p>
              </div>
            </div>

            {/* Status indicators */}
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-void-800/50">
                  {getStatusIcon(status?.ms_photos?.connected)}
                  <span className="text-white/60">MS Photos</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-void-800/50">
                  {getStatusIcon(status?.immich_db?.connected)}
                  <span className="text-white/60">Immich DB</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-void-800/50">
                  {getStatusIcon(status?.immich_api?.connected)}
                  <span className="text-white/60">Immich API</span>
                </div>
              </div>
              <button 
                onClick={loadStatus}
                className="p-2 rounded-lg hover:bg-void-700 transition-colors"
                title="Refresh status"
              >
                <RefreshCw className={`w-4 h-4 text-white/40 ${statusLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>
      </div>
      </header>

      {/* Navigation */}
      <nav className="glass border-b border-white/5">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-all relative whitespace-nowrap
                  ${activeTab === tab.id 
                    ? 'text-neon-purple' 
                    : 'text-white/50 hover:text-white/80'
                  }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
                {activeTab === tab.id && (
                  <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-neon-purple to-neon-blue" />
                )}
        </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-6 py-8">
        {activeTab === 'dashboard' && <Dashboard status={status} onRefresh={loadStatus} />}
        {activeTab === 'analytics' && <Analytics />}
        {activeTab === 'transfer' && <TransferNames />}
        {activeTab === 'assign' && <AssignFaces />}
        {activeTab === 'create' && <CreateFaces />}
        {activeTab === 'merge' && <MergeClusters />}
        {activeTab === 'fix' && <FixIssues />}
        {activeTab === 'diagnostics' && <Diagnostics />}
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 mt-auto">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <p className="text-xs text-white/30 text-center">
            Face Migration Tool v1.0.0 • Open Source • MIT License
        </p>
      </div>
      </footer>
    </div>
  );
}

function App() {
  return (
    <MatchingProvider>
      <AppContent />
    </MatchingProvider>
  );
}

export default App;
