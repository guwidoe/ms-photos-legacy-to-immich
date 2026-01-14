import { useState, useEffect } from 'react';
import { 
  Database, 
  Users, 
  Image, 
  CheckCircle2, 
  XCircle,
  RefreshCw,
  Loader2,
  ArrowRight,
  Sparkles
} from 'lucide-react';
import type { SystemStatus } from '../types';
import { previewMatches, type PersonMatch } from '../api';

interface DashboardProps {
  status: SystemStatus | null;
  onRefresh: () => void;
}

export default function Dashboard({ status, onRefresh }: DashboardProps) {
  const [preview, setPreview] = useState<{
    total_matches: number;
    applicable_matches: number;
    top_matches: PersonMatch[];
    stats: any;
  } | null>(null);
  const [loading, setLoading] = useState(false);

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

  useEffect(() => {
    if (status?.ms_photos?.connected && status?.immich_db?.connected) {
      loadPreview();
    }
  }, [status]);

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
    stats 
  }: { 
    title: string; 
    connected?: boolean; 
    stats?: Record<string, any> 
  }) => (
    <div className="glass rounded-xl p-5 border border-white/5">
      <div className="flex items-center gap-3 mb-4">
        {connected ? (
          <CheckCircle2 className="w-5 h-5 text-neon-green" />
        ) : (
          <XCircle className="w-5 h-5 text-red-500" />
        )}
        <h3 className="font-medium text-white">{title}</h3>
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
        <p className="text-red-400 text-sm">{stats.error}</p>
      )}
    </div>
  );

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
          />
          <ConnectionCard 
            title="Immich Database" 
            connected={status?.immich_db?.connected}
            stats={status?.immich_db}
          />
          <ConnectionCard 
            title="Immich API" 
            connected={status?.immich_api?.connected}
            stats={status?.immich_api}
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
    </div>
  );
}
