import { useState, useEffect } from 'react';
import {
  Users,
  Image,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  ArrowRight,
  Sparkles,
  Settings,
  FolderOpen,
  X,
  Eye,
  EyeOff
} from 'lucide-react';
import type { SystemStatus, AppConfig, PersonMatch } from '../types';
import { previewMatches, getConfig, updateMSPhotosDbPath, updateImmichApi, updateImmichDb } from '../api';

interface DashboardProps {
  status: SystemStatus | null;
  onRefresh: () => void;
}

// Modal types
type ModalType = 'ms_photos_db' | 'immich_db' | 'immich_api' | null;

export default function Dashboard({ status, onRefresh }: DashboardProps) {
  const [preview, setPreview] = useState<{
    total_matches: number;
    applicable_matches: number;
    top_matches: PersonMatch[];
    stats: any;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  // Configuration modal state
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Form state for MS Photos DB
  const [msPhotosDbPath, setMsPhotosDbPath] = useState('');

  // Form state for Immich API
  const [immichApiUrl, setImmichApiUrl] = useState('');
  const [immichApiKey, setImmichApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);

  // Form state for Immich DB
  const [immichDbHost, setImmichDbHost] = useState('');
  const [immichDbPort, setImmichDbPort] = useState('');
  const [immichDbName, setImmichDbName] = useState('');
  const [immichDbUser, setImmichDbUser] = useState('');
  const [immichDbPassword, setImmichDbPassword] = useState('');
  const [showDbPassword, setShowDbPassword] = useState(false);

  // Error state for modals
  const [configError, setConfigError] = useState<string | null>(null);

  const loadPreview = async () => {
    setLoading(true);
    try {
      const data = await previewMatches();
      setPreview(data);
    } catch (err) {
      console.error('Failed to load preview:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadConfig = async () => {
    try {
      const data = await getConfig();
      setConfig(data);
      // Pre-populate form fields
      setMsPhotosDbPath(data.ms_photos_db);
      setImmichApiUrl(data.immich_api_url);
      setImmichDbHost(data.immich_db_host);
      setImmichDbPort(String(data.immich_db_port));
      setImmichDbName(data.immich_db_name);
      setImmichDbUser(data.immich_db_user);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  useEffect(() => {
    if (status?.ms_photos?.connected && status?.immich_db?.connected) {
      loadPreview();
    }
    loadConfig();
  }, [status]);

  const openModal = (modal: ModalType) => {
    setConfigError(null);
    setActiveModal(modal);
  };

  const closeModal = () => {
    setActiveModal(null);
    setConfigLoading(false);
    setConfigError(null);
  };

  const handleMsPhotosDbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await updateMSPhotosDbPath(msPhotosDbPath);
      setConfig(result.config);
      if (result.success) {
        closeModal();
        onRefresh();
      } else {
        // Show error but keep modal open
        setConfigError(result.status?.error || 'Connection test failed');
        onRefresh(); // Still refresh to update the card
      }
    } catch (err) {
      console.error('Failed to update MS Photos DB path:', err);
      setConfigError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleImmichApiSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await updateImmichApi({
        url: immichApiUrl || undefined,
        api_key: immichApiKey || undefined,
      });
      setConfig(result.config);
      if (result.success) {
        closeModal();
        onRefresh();
      } else {
        setConfigError(result.status?.error || 'Connection test failed');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update Immich API settings:', err);
      setConfigError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setConfigLoading(false);
    }
  };

  const handleImmichDbSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setConfigLoading(true);
    setConfigError(null);
    try {
      const result = await updateImmichDb({
        host: immichDbHost || undefined,
        port: immichDbPort ? parseInt(immichDbPort) : undefined,
        name: immichDbName || undefined,
        user: immichDbUser || undefined,
        password: immichDbPassword || undefined,
      });
      setConfig(result.config);
      if (result.success) {
        closeModal();
        onRefresh();
      } else {
        setConfigError(result.status?.error || 'Connection test failed');
        onRefresh();
      }
    } catch (err) {
      console.error('Failed to update Immich DB settings:', err);
      setConfigError(err instanceof Error ? err.message : 'Failed to update configuration');
    } finally {
      setConfigLoading(false);
    }
  };

  const StatCard = ({ 
    icon: Icon, 
    label, 
    value, 
    subValue,
    color = 'purple'
  }: {
    icon: any;
    label: string;
    value: string | number;
    subValue?: string;
    color?: 'purple' | 'blue' | 'cyan' | 'green';
  }) => {
    const colors = {
      purple: 'from-neon-purple/20 to-transparent border-neon-purple/20',
      blue: 'from-neon-blue/20 to-transparent border-neon-blue/20',
      cyan: 'from-neon-cyan/20 to-transparent border-neon-cyan/20',
      green: 'from-neon-green/20 to-transparent border-neon-green/20',
    };

    const iconColors = {
      purple: 'text-neon-purple',
      blue: 'text-neon-blue',
      cyan: 'text-neon-cyan',
      green: 'text-neon-green',
    };

    return (
      <div className={`glass rounded-xl p-5 bg-gradient-to-br ${colors[color]} border ${colors[color].split(' ')[2]}`}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/50 text-sm">{label}</p>
            <p className="text-3xl font-semibold text-white mt-1">{value.toLocaleString()}</p>
            {subValue && <p className="text-xs text-white/40 mt-1">{subValue}</p>}
          </div>
          <div className={`p-2 rounded-lg bg-void-800/50 ${iconColors[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </div>
    );
  };

  const ConnectionCard = ({
    title,
    connected,
    stats,
    configType
  }: {
    title: string;
    connected?: boolean;
    stats?: Record<string, any>;
    configType: ModalType;
  }) => (
    <div className="glass rounded-xl p-5 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {connected ? (
            <CheckCircle2 className="w-5 h-5 text-neon-green" />
          ) : (
            <XCircle className="w-5 h-5 text-red-500" />
          )}
          <h3 className="font-medium text-white">{title}</h3>
        </div>
        <button
          onClick={() => openModal(configType)}
          className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
          title="Configure"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
      {stats && connected && (
        <div className="space-y-2">
          {Object.entries(stats)
            .filter(([k]) => k !== 'connected' && k !== 'error')
            .map(([key, value]) => (
              <div key={key} className="flex justify-between text-sm">
                <span className="text-white/50">{key.replace(/_/g, ' ')}</span>
                <span className="text-white font-mono">
                  {typeof value === 'number' ? value.toLocaleString() : value}
                </span>
              </div>
            ))}
        </div>
      )}
      {!connected && stats?.error && (
        <div className="space-y-3">
          <p className="text-red-400 text-sm">{stats.error}</p>
          <button
            onClick={() => openModal(configType)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple transition-colors text-sm font-medium"
          >
            <FolderOpen className="w-4 h-4" />
            Configure
          </button>
        </div>
      )}
      {!connected && !stats?.error && (
        <button
          onClick={() => openModal(configType)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-neon-purple/20 hover:bg-neon-purple/30 text-neon-purple transition-colors text-sm font-medium"
        >
          <FolderOpen className="w-4 h-4" />
          Configure
        </button>
      )}
    </div>
  );

  // Modal component
  const Modal = ({
    isOpen,
    onClose,
    title,
    children,
    error
  }: {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
    error?: string | null;
  }) => {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
        <div className="relative glass rounded-2xl p-6 border border-white/10 w-full max-w-md mx-4 animate-slide-up">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">{title}</h3>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-white/50 hover:text-white"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-slide-up">
      {/* Hero section */}
      <div className="relative overflow-hidden rounded-2xl glass p-8 border border-white/5">
        <div className="absolute top-0 right-0 w-96 h-96 bg-neon-purple/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-neon-blue/10 rounded-full blur-3xl" />
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 text-neon-purple mb-2">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Migration Overview</span>
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">
            Migrate your face labels from Windows Photos to Immich
          </h2>
          <p className="text-white/50 max-w-2xl">
            This tool matches people you've labeled in Windows Photos Legacy with face clusters 
            detected by Immich, allowing you to transfer hundreds of names automatically.
          </p>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard 
          icon={Users} 
          label="MS Photos People" 
          value={status?.ms_photos?.unique_named_persons ?? status?.ms_photos?.named_persons ?? '—'} 
          subValue={`${status?.ms_photos?.total_faces?.toLocaleString() ?? '?'} faces detected`}
          color="purple"
        />
        <StatCard 
          icon={Users} 
          label="Immich Clusters" 
          value={status?.immich_db?.total_persons ?? '—'} 
          subValue={`${status?.immich_db?.unnamed_persons ?? '?'} unnamed`}
          color="blue"
        />
        <StatCard 
          icon={Image} 
          label="Total Assets" 
          value={status?.immich_db?.total_assets ?? '—'} 
          color="cyan"
        />
        <StatCard 
          icon={CheckCircle2} 
          label="Potential Matches" 
          value={preview?.applicable_matches ?? '—'} 
          subValue={loading ? 'Loading...' : 'ready to apply'}
          color="green"
        />
      </div>

      {/* Connection status */}
      <div>
        <h3 className="text-lg font-medium text-white mb-4">Data Sources</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ConnectionCard
            title="MS Photos Database"
            connected={status?.ms_photos?.connected}
            stats={status?.ms_photos}
            configType="ms_photos_db"
          />
          <ConnectionCard
            title="Immich Database"
            connected={status?.immich_db?.connected}
            stats={status?.immich_db}
            configType="immich_db"
          />
          <ConnectionCard
            title="Immich API"
            connected={status?.immich_api?.connected}
            stats={status?.immich_api}
            configType="immich_api"
          />
        </div>
      </div>

      {/* Preview matches */}
      {preview && preview.top_matches.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-white">Top Matches Preview</h3>
            <button 
              onClick={loadPreview}
              className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          
          <div className="glass rounded-xl border border-white/5 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Person Name</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Matches</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-3">Confidence</th>
                  <th className="text-left text-xs text-white/50 font-medium px-4 py-3">IoU Score</th>
                </tr>
              </thead>
              <tbody>
                {preview.top_matches.slice(0, 5).map((match, i) => (
                  <tr key={i} className="border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-white font-medium">{match.ms_person_name}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/70">{match.face_matches} photos</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        match.confidence === 'high' ? 'bg-neon-green/20 text-neon-green' :
                        match.confidence === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {match.confidence}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-white/50 font-mono text-sm">
                        {(match.avg_iou * 100).toFixed(0)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Workflow guide */}
      <div className="glass rounded-xl p-6 border border-white/5">
        <h3 className="text-lg font-medium text-white mb-4">Migration Workflow</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { step: 1, title: 'Run Matching', desc: 'Find people who appear in both databases' },
            { step: 2, title: 'Validate', desc: 'Check for clustering errors in Immich' },
            { step: 3, title: 'Review', desc: 'Verify matches with side-by-side thumbnails' },
            { step: 4, title: 'Apply', desc: 'Apply approved names to Immich clusters' },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-neon-purple/20 text-neon-purple flex items-center justify-center text-sm font-semibold shrink-0">
                {item.step}
              </div>
              <div>
                <p className="text-white font-medium">{item.title}</p>
                <p className="text-sm text-white/50">{item.desc}</p>
              </div>
              {i < 3 && (
                <ArrowRight className="w-4 h-4 text-white/20 hidden md:block ml-auto mt-2" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Configuration Modals */}

      {/* MS Photos Database Configuration Modal */}
      <Modal isOpen={activeModal === 'ms_photos_db'} onClose={closeModal} title="Configure MS Photos Database" error={configError}>
        <form onSubmit={handleMsPhotosDbSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Database File Path
            </label>
            <input
              type="text"
              value={msPhotosDbPath}
              onChange={(e) => setMsPhotosDbPath(e.target.value)}
              placeholder="C:\Users\...\MediaDb.v1.sqlite"
              className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
            />
            <p className="mt-2 text-xs text-white/40">
              Enter the full path to your Windows Photos MediaDb.v1.sqlite file
            </p>
          </div>
          {config?.ms_photos_db_path && (
            <div className="text-xs text-white/40">
              Current resolved path: <span className="font-mono text-white/60">{config.ms_photos_db_path}</span>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={configLoading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-neon-purple hover:bg-neon-purple/80 text-white font-medium transition-colors disabled:opacity-50"
            >
              {configLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Test'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Immich API Configuration Modal */}
      <Modal isOpen={activeModal === 'immich_api'} onClose={closeModal} title="Configure Immich API" error={configError}>
        <form onSubmit={handleImmichApiSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Immich URL
            </label>
            <input
              type="text"
              value={immichApiUrl}
              onChange={(e) => setImmichApiUrl(e.target.value)}
              placeholder="http://localhost:2283"
              className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              API Key
            </label>
            <div className="relative">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={immichApiKey}
                onChange={(e) => setImmichApiKey(e.target.value)}
                placeholder={config?.immich_api_key_set ? '••••••••••••••••' : 'Enter your API key'}
                className="w-full px-4 py-2.5 pr-10 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/40">
              Generate an API key in Immich under Account Settings &gt; API Keys
            </p>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={configLoading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-neon-purple hover:bg-neon-purple/80 text-white font-medium transition-colors disabled:opacity-50"
            >
              {configLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Test'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Immich Database Configuration Modal */}
      <Modal isOpen={activeModal === 'immich_db'} onClose={closeModal} title="Configure Immich Database" error={configError}>
        <form onSubmit={handleImmichDbSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-white/70 mb-2">
                Host
              </label>
              <input
                type="text"
                value={immichDbHost}
                onChange={(e) => setImmichDbHost(e.target.value)}
                placeholder="localhost"
                className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
              />
            </div>
            <div className="col-span-2 sm:col-span-1">
              <label className="block text-sm font-medium text-white/70 mb-2">
                Port
              </label>
              <input
                type="text"
                value={immichDbPort}
                onChange={(e) => setImmichDbPort(e.target.value)}
                placeholder="5432"
                className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Database Name
            </label>
            <input
              type="text"
              value={immichDbName}
              onChange={(e) => setImmichDbName(e.target.value)}
              placeholder="immich"
              className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Username
            </label>
            <input
              type="text"
              value={immichDbUser}
              onChange={(e) => setImmichDbUser(e.target.value)}
              placeholder="postgres"
              className="w-full px-4 py-2.5 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Password
            </label>
            <div className="relative">
              <input
                type={showDbPassword ? 'text' : 'password'}
                value={immichDbPassword}
                onChange={(e) => setImmichDbPassword(e.target.value)}
                placeholder={config?.immich_db_password_set ? '••••••••••••••••' : 'Enter password'}
                className="w-full px-4 py-2.5 pr-10 rounded-lg bg-void-800 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-neon-purple/50 focus:ring-1 focus:ring-neon-purple/50"
              />
              <button
                type="button"
                onClick={() => setShowDbPassword(!showDbPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
              >
                {showDbPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={closeModal}
              className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-white/70 hover:bg-white/5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={configLoading}
              className="flex-1 px-4 py-2.5 rounded-lg bg-neon-purple hover:bg-neon-purple/80 text-white font-medium transition-colors disabled:opacity-50"
            >
              {configLoading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Save & Test'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
