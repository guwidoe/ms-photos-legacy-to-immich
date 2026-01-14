import { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Users, 
  Ghost,
  RefreshCw,
  Loader2,
  Search,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  XCircle,
  CheckCircle2,
  Image,
  FileQuestion
} from 'lucide-react';

interface OrphanPerson {
  ms_person_id: number;
  ms_person_name: string;
  historical_item_count: number;
  current_face_count: number;
  has_cluster: boolean;
}

interface OrphanResult {
  orphan_people: OrphanPerson[];
  people_with_faces: number;
  total_named_people: number;
  stats: {
    orphan_count: number;
    with_faces_count: number;
    total_historical_items_lost: number;
  };
}

export default function Diagnostics() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orphanData, setOrphanData] = useState<OrphanResult | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAll, setShowAll] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/diagnostics/orphan-people');
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      setOrphanData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrphans = orphanData?.orphan_people.filter(p => 
    p.ms_person_name.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  const displayedOrphans = showAll ? filteredOrphans : filteredOrphans.slice(0, 50);

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="glass rounded-xl p-6 border border-white/5">
        <div className="flex items-start gap-4">
          <div className="p-3 rounded-xl bg-yellow-500/10">
            <AlertTriangle className="w-6 h-6 text-yellow-400" />
          </div>
          <div className="flex-1">
            <h2 className="text-lg font-medium text-white mb-1">Diagnostics</h2>
            <p className="text-white/50 text-sm">
              Investigate issues with your MS Photos database and migration status.
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-void-700 hover:bg-void-600 text-white text-sm font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="glass rounded-xl p-4 border border-red-500/30 bg-red-500/10">
          <div className="flex items-center gap-2 text-red-400">
            <XCircle className="w-5 h-5" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {loading && !orphanData && (
        <div className="glass rounded-xl p-8 border border-white/5 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-neon-purple" />
        </div>
      )}

      {orphanData && (
        <>
          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3">
                <Users className="w-5 h-5 text-neon-purple" />
                <div>
                  <p className="text-white/50 text-xs">Total Named People</p>
                  <p className="text-xl font-semibold text-white">{orphanData.total_named_people}</p>
                </div>
              </div>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-neon-green" />
                <div>
                  <p className="text-white/50 text-xs">With Face Data</p>
                  <p className="text-xl font-semibold text-white">{orphanData.people_with_faces}</p>
                </div>
              </div>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3">
                <Ghost className="w-5 h-5 text-yellow-400" />
                <div>
                  <p className="text-white/50 text-xs">Orphan People</p>
                  <p className="text-xl font-semibold text-yellow-400">{orphanData.stats.orphan_count}</p>
                </div>
              </div>
            </div>
            <div className="glass rounded-xl p-4 border border-white/5">
              <div className="flex items-center gap-3">
                <FileQuestion className="w-5 h-5 text-red-400" />
                <div>
                  <p className="text-white/50 text-xs">Historical Items Lost</p>
                  <p className="text-xl font-semibold text-red-400">{orphanData.stats.total_historical_items_lost}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Explanation Card */}
          <div className="glass rounded-xl p-5 border border-yellow-500/20 bg-yellow-500/5">
            <div className="flex items-start gap-3">
              <HelpCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h3 className="text-white font-medium mb-2">What are "Orphan People"?</h3>
                <p className="text-white/70 text-sm leading-relaxed">
                  These are people who were named in MS Photos Legacy but their <strong>face coordinate data has been deleted</strong>. 
                  The <code className="text-yellow-400 bg-black/30 px-1 rounded">Person_ItemCount</code> field shows they once had faces tagged, 
                  but the actual <code className="text-yellow-400 bg-black/30 px-1 rounded">Face</code> records (with x, y, width, height) are gone.
                </p>
                <p className="text-white/50 text-sm mt-2">
                  <strong>This can happen when:</strong> MS Photos re-indexed your library, photos were deleted, 
                  or the app was reinstalled. Unfortunately, <strong>these people cannot be transferred</strong> because 
                  there's no face position data to match with Immich.
                </p>
              </div>
            </div>
          </div>

          {/* Orphan People Table */}
          {orphanData.stats.orphan_count > 0 && (
            <div className="glass rounded-xl border border-white/5 overflow-hidden">
              <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="text-white font-medium flex items-center gap-2">
                  <Ghost className="w-5 h-5 text-yellow-400" />
                  Orphan People ({filteredOrphans.length})
                </h3>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                    <input
                      type="text"
                      placeholder="Search names..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9 pr-4 py-2 bg-void-800 rounded-lg text-white text-sm border border-white/10 focus:border-neon-purple/50 outline-none w-64"
                    />
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-white/5 text-left">
                      <th className="p-3 text-xs text-white/50 font-medium">Name</th>
                      <th className="p-3 text-xs text-white/50 font-medium text-right">Historical Items</th>
                      <th className="p-3 text-xs text-white/50 font-medium text-right">Current Faces</th>
                      <th className="p-3 text-xs text-white/50 font-medium text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedOrphans.map((person) => (
                      <tr key={person.ms_person_id} className="border-b border-white/5 hover:bg-white/5">
                        <td className="p-3">
                          <span className="text-white font-medium">{person.ms_person_name}</span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-yellow-400 font-mono">
                            {person.historical_item_count > 0 ? person.historical_item_count : '—'}
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <span className="text-red-400 font-mono">0</span>
                        </td>
                        <td className="p-3 text-center">
                          <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs bg-red-500/20 text-red-400">
                            <XCircle className="w-3 h-3" />
                            Data Lost
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredOrphans.length > 50 && !showAll && (
                <div className="p-4 border-t border-white/5">
                  <button
                    onClick={() => setShowAll(true)}
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
                  >
                    <ChevronDown className="w-4 h-4" />
                    Show all {filteredOrphans.length} orphan people
                  </button>
                </div>
              )}

              {showAll && filteredOrphans.length > 50 && (
                <div className="p-4 border-t border-white/5">
                  <button
                    onClick={() => setShowAll(false)}
                    className="flex items-center gap-2 text-sm text-white/50 hover:text-white"
                  >
                    <ChevronUp className="w-4 h-4" />
                    Show fewer
                  </button>
                </div>
              )}
            </div>
          )}

          {orphanData.stats.orphan_count === 0 && (
            <div className="glass rounded-xl p-8 border border-white/5 text-center">
              <CheckCircle2 className="w-12 h-12 text-neon-green mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">No Orphan People</h3>
              <p className="text-white/50 text-sm">
                All named people in your MS Photos database have face data. Great!
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
