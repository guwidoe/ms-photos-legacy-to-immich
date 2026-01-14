import { useMemo } from 'react';
import { 
  BarChart3, 
  Loader2, 
  Lightbulb,
  TrendingUp,
  Filter,
  Target,
  Percent,
  Play,
  Users,
  GitMerge,
  AlertTriangle,
  UserPlus,
  Clock
} from 'lucide-react';
import { useMatching } from '../context/MatchingContext';

// Simple histogram bar chart component
function Histogram({ 
  data, 
  threshold, 
  onThresholdChange,
  title,
  color,
  invertThreshold = false // For center distance, lower is better
}: { 
  data: { bins: number[]; counts: number[] };
  threshold: number;
  onThresholdChange: (v: number) => void;
  title: string;
  color: string;
  invertThreshold?: boolean;
}) {
  const maxCount = Math.max(...data.counts, 1);
  
  return (
    <div className="p-4 bg-void-800 rounded-lg">
      <h4 className="text-white/80 font-medium mb-3">{title}</h4>
      
      {/* Histogram bars */}
      <div className="flex items-end gap-0.5 h-32 mb-2">
        {data.bins.map((bin, i) => {
          const height = (data.counts[i] / maxCount) * 100;
          const isAboveThreshold = invertThreshold 
            ? bin <= threshold 
            : bin >= threshold;
          
          return (
            <div
              key={i}
              className="flex-1 relative group"
              style={{ height: '100%' }}
            >
              <div
                className={`absolute bottom-0 w-full rounded-t transition-colors ${
                  isAboveThreshold ? color : 'bg-white/20'
                }`}
                style={{ height: `${height}%` }}
              />
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                <div className="bg-black/90 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
                  {(bin * 100).toFixed(0)}%: {data.counts[i].toLocaleString()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      
      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-white/40 mb-3">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
      
      {/* Threshold slider */}
      <div className="flex items-center gap-3">
        <span className="text-white/60 text-sm whitespace-nowrap">
          {invertThreshold ? 'Max' : 'Min'}: {(threshold * 100).toFixed(0)}%
        </span>
        <input
          type="range"
          min="0.05"
          max="0.95"
          step="0.05"
          value={threshold}
          onChange={(e) => onThresholdChange(parseFloat(e.target.value))}
          className={`flex-1 ${color === 'bg-neon-purple' ? 'accent-purple-500' : 'accent-blue-500'}`}
        />
      </div>
    </div>
  );
}

// Statistics card component
function StatCard({ label, value, subtext, icon: Icon }: { 
  label: string; 
  value: string | number; 
  subtext?: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="p-4 bg-void-800 rounded-lg">
      <div className="flex items-center gap-2 mb-1">
        {Icon && <Icon className="w-4 h-4 text-white/40" />}
        <span className="text-white/60 text-sm">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {subtext && <p className="text-xs text-white/40 mt-1">{subtext}</p>}
    </div>
  );
}

export default function Analytics() {
  const {
    algorithmRunning,
    loading,
    lastRun,
    error,
    rawMatches,
    histograms,
    percentiles,
    suggestedThresholds,
    cumulative,
    stats,
    minIoU,
    maxCenterDist,
    pendingMinIoU,
    pendingMaxCenterDist,
    thresholdsDirty,
    runAlgorithm,
    setPendingMinIoU,
    setPendingMaxCenterDist,
    applyThresholds,
  } = useMatching();

  // Filter raw matches based on pending thresholds (for local preview)
  const filteredMatches = useMemo(() => {
    if (!rawMatches) return [];
    return rawMatches.filter(
      m => m.iou >= pendingMinIoU && m.center_dist <= pendingMaxCenterDist
    );
  }, [rawMatches, pendingMinIoU, pendingMaxCenterDist]);

  // Aggregate filtered matches by person-cluster pairs
  const aggregatedMatches = useMemo(() => {
    const grouped = new Map<string, { 
      ms_person_name: string;
      immich_cluster_name: string | null;
      count: number;
      avg_iou: number;
      avg_center_dist: number;
    }>();
    
    for (const match of filteredMatches) {
      const key = `${match.ms_person_id}-${match.immich_cluster_id}`;
      const existing = grouped.get(key);
      
      if (existing) {
        existing.count++;
        existing.avg_iou = (existing.avg_iou * (existing.count - 1) + match.iou) / existing.count;
        existing.avg_center_dist = (existing.avg_center_dist * (existing.count - 1) + match.center_dist) / existing.count;
      } else {
        grouped.set(key, {
          ms_person_name: match.ms_person_name,
          immich_cluster_name: match.immich_cluster_name,
          count: 1,
          avg_iou: match.iou,
          avg_center_dist: match.center_dist,
        });
      }
    }
    
    return Array.from(grouped.values()).sort((a, b) => b.count - a.count);
  }, [filteredMatches]);

  // Confidence breakdown
  const confidenceBreakdown = useMemo(() => {
    const high = aggregatedMatches.filter(m => m.count >= 5 && m.avg_iou >= 0.4).length;
    const medium = aggregatedMatches.filter(m => m.count >= 2 && m.avg_iou >= 0.35 && !(m.count >= 5 && m.avg_iou >= 0.4)).length;
    const low = aggregatedMatches.length - high - medium;
    return { high, medium, low };
  }, [aggregatedMatches]);

  // Show initial state with Run Algorithm button
  if (!lastRun) {
    return (
      <div className="space-y-6 animate-slide-up">
        {/* Run Algorithm CTA */}
        <div className="glass rounded-xl p-8 border border-neon-purple/30 text-center">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-2xl bg-neon-purple/10">
              <BarChart3 className="w-12 h-12 text-neon-purple" />
            </div>
          </div>
          <h2 className="text-2xl font-medium text-white mb-3">Run Algorithm Analysis</h2>
          <p className="text-white/50 text-sm max-w-xl mx-auto mb-6">
            Click the button below to run the matching algorithm. This will analyze all faces
            in both databases, compute match scores, and provide analytics to help you 
            configure optimal thresholds.
          </p>
          <button
            onClick={runAlgorithm}
            disabled={algorithmRunning}
            className="inline-flex items-center gap-3 px-8 py-4 rounded-xl bg-gradient-to-r from-neon-purple to-neon-cyan text-white font-medium text-lg hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {algorithmRunning ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Running Analysis...
              </>
            ) : (
              <>
                <Play className="w-6 h-6" />
                Run Algorithm
              </>
            )}
          </button>
          {error && (
            <p className="mt-4 text-red-400 text-sm">{error}</p>
          )}
        </div>

        {/* What will be analyzed */}
        <div className="glass rounded-xl p-6 border border-white/5">
          <h3 className="text-white font-medium mb-4">What the algorithm does:</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-void-800">
              <Users className="w-5 h-5 text-neon-cyan mb-2" />
              <p className="text-white/80 text-sm font-medium">Transfer Names</p>
              <p className="text-white/50 text-xs mt-1">
                Find Immich clusters matching MS Photos people
              </p>
            </div>
            <div className="p-4 rounded-lg bg-void-800">
              <UserPlus className="w-5 h-5 text-neon-green mb-2" />
              <p className="text-white/80 text-sm font-medium">Assign Faces</p>
              <p className="text-white/50 text-xs mt-1">
                Find unclustered faces to assign to people
              </p>
            </div>
            <div className="p-4 rounded-lg bg-void-800">
              <GitMerge className="w-5 h-5 text-neon-purple mb-2" />
              <p className="text-white/80 text-sm font-medium">Merge Clusters</p>
              <p className="text-white/50 text-xs mt-1">
                Find split clusters that should be merged
              </p>
            </div>
            <div className="p-4 rounded-lg bg-void-800">
              <AlertTriangle className="w-5 h-5 text-yellow-400 mb-2" />
              <p className="text-white/80 text-sm font-medium">Fix Issues</p>
              <p className="text-white/50 text-xs mt-1">
                Detect clustering errors and mismatches
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Header */}
      <div className="glass rounded-xl p-6 border border-white/5">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-neon-cyan/10">
              <BarChart3 className="w-6 h-6 text-neon-cyan" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-white mb-1">Algorithm Analytics</h2>
              <p className="text-white/50 text-sm max-w-2xl">
                Analyze the distribution of match scores to find optimal thresholds. 
                Adjust sliders to see how many matches pass the filter across all tabs.
              </p>
              {lastRun && (
                <div className="flex items-center gap-2 mt-2 text-white/40 text-xs">
                  <Clock className="w-3 h-3" />
                  Last run: {lastRun.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={runAlgorithm}
            disabled={algorithmRunning || loading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-neon-purple to-neon-cyan text-white font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {algorithmRunning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Re-run Algorithm
              </>
            )}
          </button>
        </div>
      </div>

      {stats && (
        <>
          {/* Tab Preview Stats */}
          <div className="glass rounded-xl p-6 border border-white/5">
            <h3 className="text-white font-medium mb-4">Work Summary at Current Thresholds</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-neon-cyan" />
                  <span className="text-white/60 text-sm">Transfer Names</span>
                </div>
                <p className="text-2xl font-semibold text-neon-cyan">{stats.applicableMatches}</p>
                <p className="text-xs text-white/40 mt-1">clusters to rename</p>
              </div>
              <div className="p-4 rounded-lg bg-neon-green/10 border border-neon-green/30">
                <div className="flex items-center gap-2 mb-2">
                  <UserPlus className="w-4 h-4 text-neon-green" />
                  <span className="text-white/60 text-sm">Assign Faces</span>
                </div>
                <p className="text-2xl font-semibold text-neon-green">{stats.totalUnclusteredFaces}</p>
                <p className="text-xs text-white/40 mt-1">faces to assign</p>
              </div>
              <div className="p-4 rounded-lg bg-neon-purple/10 border border-neon-purple/30">
                <div className="flex items-center gap-2 mb-2">
                  <GitMerge className="w-4 h-4 text-neon-purple" />
                  <span className="text-white/60 text-sm">Merge Clusters</span>
                </div>
                <p className="text-2xl font-semibold text-neon-purple">{stats.peopleWithSplitClusters}</p>
                <p className="text-xs text-white/40 mt-1">people to merge</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-400/10 border border-yellow-400/30">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-yellow-400" />
                  <span className="text-white/60 text-sm">Fix Issues</span>
                </div>
                <p className="text-2xl font-semibold text-yellow-400">{stats.clustersWithIssues}</p>
                <p className="text-xs text-white/40 mt-1">clusters with issues</p>
              </div>
            </div>
          </div>

          {/* Overview Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={Target}
              label="Raw Potential Matches"
              value={stats.totalRawMatches.toLocaleString()}
              subtext="Any IoU > 0%"
            />
            <StatCard
              icon={Filter}
              label="Filtered Matches"
              value={filteredMatches.length.toLocaleString()}
              subtext={`${((filteredMatches.length / stats.totalRawMatches) * 100).toFixed(1)}% pass filters`}
            />
            <StatCard
              icon={TrendingUp}
              label="Unique Person Matches"
              value={aggregatedMatches.length.toLocaleString()}
              subtext="MS Photos → Immich pairs"
            />
            <StatCard
              icon={Percent}
              label="Common Photos"
              value={stats.commonPhotos.toLocaleString()}
              subtext="Photos in both databases"
            />
          </div>

          {/* Suggested Thresholds */}
          {suggestedThresholds && (
            <div className="glass rounded-xl p-4 border border-neon-green/20">
              <div className="flex items-center gap-3">
                <Lightbulb className="w-5 h-5 text-neon-green" />
                <span className="text-white font-medium">Suggested Optimal Thresholds</span>
                <span className="text-white/50 text-sm">(via Otsu's method)</span>
              </div>
              <div className="mt-3 flex items-center gap-6">
                <div>
                  <span className="text-white/60 text-sm">Min IoU: </span>
                  <span className="text-neon-green font-mono">
                    {(suggestedThresholds.iou * 100).toFixed(0)}%
                  </span>
                </div>
                <div>
                  <span className="text-white/60 text-sm">Max Center Distance: </span>
                  <span className="text-neon-green font-mono">
                    {(suggestedThresholds.center_dist * 100).toFixed(0)}%
                  </span>
                </div>
                <button
                  onClick={() => {
                    setPendingMinIoU(suggestedThresholds.iou);
                    setPendingMaxCenterDist(suggestedThresholds.center_dist);
                  }}
                  className="ml-auto text-sm text-neon-green hover:text-white transition-colors"
                >
                  Use Suggested Values
                </button>
              </div>
            </div>
          )}

          {/* Histograms */}
          {histograms && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="glass rounded-xl p-6 border border-white/5">
                  <Histogram
                    data={histograms.iou}
                    threshold={pendingMinIoU}
                    onThresholdChange={setPendingMinIoU}
                    title="IoU Distribution (Face Overlap)"
                    color="bg-neon-purple"
                  />
                  {percentiles && (
                    <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-white/40">Median</span>
                        <p className="text-white font-mono">{(percentiles.iou.p50 * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-white/40">Mean</span>
                        <p className="text-white font-mono">{(percentiles.iou.mean * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-white/40">P95</span>
                        <p className="text-white font-mono">{(percentiles.iou.p95 * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="glass rounded-xl p-6 border border-white/5">
                  <Histogram
                    data={histograms.center_dist}
                    threshold={pendingMaxCenterDist}
                    onThresholdChange={setPendingMaxCenterDist}
                    title="Center Distance Distribution"
                    color="bg-neon-blue"
                    invertThreshold={true}
                  />
                  {percentiles && (
                    <div className="mt-4 grid grid-cols-3 gap-4 text-xs">
                      <div>
                        <span className="text-white/40">Median</span>
                        <p className="text-white font-mono">{(percentiles.center_dist.p50 * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-white/40">Mean</span>
                        <p className="text-white font-mono">{(percentiles.center_dist.mean * 100).toFixed(1)}%</p>
                      </div>
                      <div>
                        <span className="text-white/40">P5 (best)</span>
                        <p className="text-white font-mono">{(percentiles.center_dist.p5 * 100).toFixed(1)}%</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {/* Apply Thresholds Button */}
              <div className="flex items-center justify-between p-4 glass rounded-xl border border-white/5">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-white/50">Current: </span>
                    <span className="text-white font-mono">IoU ≥ {(minIoU * 100).toFixed(0)}%</span>
                    <span className="text-white/30 mx-2">|</span>
                    <span className="text-white font-mono">CD ≤ {(maxCenterDist * 100).toFixed(0)}%</span>
                  </div>
                  {thresholdsDirty && (
                    <div className="text-neon-cyan">
                      <span className="text-white/50">Pending: </span>
                      <span className="font-mono">IoU ≥ {(pendingMinIoU * 100).toFixed(0)}%</span>
                      <span className="text-white/30 mx-2">|</span>
                      <span className="font-mono">CD ≤ {(pendingMaxCenterDist * 100).toFixed(0)}%</span>
                    </div>
                  )}
                </div>
                <button
                  onClick={applyThresholds}
                  disabled={!thresholdsDirty || loading}
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium text-sm transition-all ${
                    thresholdsDirty
                      ? 'bg-gradient-to-r from-neon-purple to-neon-cyan text-white hover:opacity-90'
                      : 'bg-void-700 text-white/30 cursor-not-allowed'
                  }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Applying...
                    </>
                  ) : (
                    <>
                      <Filter className="w-4 h-4" />
                      Apply Thresholds
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Confidence Breakdown */}
          <div className="glass rounded-xl p-6 border border-white/5">
            <h3 className="text-white font-medium mb-4">Confidence Breakdown at Current Thresholds</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-neon-green/10 border border-neon-green/30">
                <p className="text-2xl font-semibold text-neon-green">{confidenceBreakdown.high}</p>
                <p className="text-sm text-white/60">High Confidence</p>
                <p className="text-xs text-white/40 mt-1">≥5 matches, ≥40% avg IoU</p>
              </div>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                <p className="text-2xl font-semibold text-yellow-400">{confidenceBreakdown.medium}</p>
                <p className="text-sm text-white/60">Medium Confidence</p>
                <p className="text-xs text-white/40 mt-1">≥2 matches, ≥35% avg IoU</p>
              </div>
              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30">
                <p className="text-2xl font-semibold text-red-400">{confidenceBreakdown.low}</p>
                <p className="text-sm text-white/60">Low Confidence</p>
                <p className="text-xs text-white/40 mt-1">Other matches</p>
              </div>
            </div>
          </div>

          {/* Cumulative distribution info */}
          {cumulative && (
            <div className="glass rounded-xl p-6 border border-white/5">
              <h3 className="text-white font-medium mb-4">Match Retention at Various Thresholds</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* IoU cumulative */}
                <div>
                  <h4 className="text-white/60 text-sm mb-3">IoU ≥ threshold (% of matches kept)</h4>
                  <div className="space-y-2">
                    {cumulative.iou.thresholds.map((t, i) => (
                      <div key={t} className="flex items-center gap-3">
                        <span className="text-white/50 text-sm w-16">≥{(t * 100).toFixed(0)}%</span>
                        <div className="flex-1 h-2 bg-void-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-neon-purple rounded-full"
                            style={{ width: `${cumulative.iou.percent_above?.[i] || 0}%` }}
                          />
                        </div>
                        <span className="text-white/70 text-sm w-12 text-right">
                          {(cumulative.iou.percent_above?.[i] || 0).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                
                {/* Center Distance cumulative */}
                <div>
                  <h4 className="text-white/60 text-sm mb-3">Center Dist ≤ threshold (% of matches kept)</h4>
                  <div className="space-y-2">
                    {cumulative.center_dist.thresholds.map((t, i) => (
                      <div key={t} className="flex items-center gap-3">
                        <span className="text-white/50 text-sm w-16">≤{(t * 100).toFixed(0)}%</span>
                        <div className="flex-1 h-2 bg-void-700 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-neon-blue rounded-full"
                            style={{ width: `${cumulative.center_dist.percent_below?.[i] || 0}%` }}
                          />
                        </div>
                        <span className="text-white/70 text-sm w-12 text-right">
                          {(cumulative.center_dist.percent_below?.[i] || 0).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Top matches preview */}
          <div className="glass rounded-xl p-6 border border-white/5">
            <h3 className="text-white font-medium mb-4">
              Top Person Matches at Current Thresholds
              <span className="text-white/50 font-normal text-sm ml-2">
                (showing top 20 of {aggregatedMatches.length})
              </span>
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="text-left text-xs text-white/50 font-medium py-2 px-3">MS Photos Person</th>
                    <th className="text-left text-xs text-white/50 font-medium py-2 px-3">Immich Cluster</th>
                    <th className="text-right text-xs text-white/50 font-medium py-2 px-3">Matches</th>
                    <th className="text-right text-xs text-white/50 font-medium py-2 px-3">Avg IoU</th>
                    <th className="text-right text-xs text-white/50 font-medium py-2 px-3">Avg Dist</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregatedMatches.slice(0, 20).map((match, i) => (
                    <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3 text-white">{match.ms_person_name}</td>
                      <td className="py-2 px-3 text-white/70">
                        {match.immich_cluster_name || <span className="text-white/40 italic">Unnamed</span>}
                      </td>
                      <td className="py-2 px-3 text-right text-white font-mono">{match.count}</td>
                      <td className="py-2 px-3 text-right text-neon-purple font-mono">
                        {(match.avg_iou * 100).toFixed(1)}%
                      </td>
                      <td className="py-2 px-3 text-right text-neon-blue font-mono">
                        {(match.avg_center_dist * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="fixed inset-0 bg-void-950/50 flex items-center justify-center z-50">
          <div className="glass rounded-xl p-6 border border-white/10 flex items-center gap-4">
            <Loader2 className="w-6 h-6 animate-spin text-neon-purple" />
            <span className="text-white">Updating with new thresholds...</span>
          </div>
        </div>
      )}
    </div>
  );
}
