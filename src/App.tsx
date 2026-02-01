import { useState, useMemo, useEffect } from 'react';
import rawRecipes from './data/recipes.json';
import type { Buildings, OptimizerResult } from './types';
import { calculateRequirements } from './utils/calculations';
import { SankeyChart } from './components/SankeyChart';
import { optimizeLayout } from './utils/optimizer';
import { runGeneticOptimization, type GAParams } from './utils/geneticOptimizer';
import { ClusterDiagram } from './components/ClusterDiagram';
import { v4 as uuidv4 } from 'uuid';

// Cast the JSON to our type
const buildings = rawRecipes as Buildings;

// Extract all possible outputs for the dropdown
const allProducts = Array.from(new Set(
  buildings.flatMap(b => b.recipes?.map(r => r.output.id) || [])
)).sort();

interface Target {
  key: string;
  id: string; // item id
  amount: number;
}

function App() {
  const [targets, setTargets] = useState<Target[]>([
    { key: uuidv4(), id: 'superconductor', amount: 12 }
  ]);

  const [view, setView] = useState<'sankey' | 'kmeans' | 'genetic'>('kmeans');

  // State for optimization controls
  const [optimizationResult, setOptimizationResult] = useState<OptimizerResult | null>(null);
  const [numClusters, setNumClusters] = useState<number>(6);

  // New: Split Constraints instead of separateChains
  const [splitConstraints, setSplitConstraints] = useState<[string, string][]>([
    ['titanium_ore', 'wolfram_ore'],
    ['wolfram_ore', 'calcium_ore'],
    ['titanium_ore', 'calcium_ore'],
    ['titanium_ore', 'helium'],
    ['titanium_ore', 'sulphur_ore'],
    ['calcium_ore', 'helium'],
    ['calcium_ore', 'sulphur_ore'],
    ['wolfram_ore', 'helium'],
    ['wolfram_ore', 'sulphur_ore']
  ]);

  const [isOptimizing, setIsOptimizing] = useState<boolean>(false);
  const [constraints, setConstraints] = useState<[string, string][]>([
    ['calcium_ore', 'calcium_block'],
    ['calcium_block', 'calcite_sheets'],
    ['calcium_block', 'calcium_powder'],
    ['titanium_ore', 'titanium_bar'],
    ['titanium_bar', 'titanium_rod'],
    ['titanium_bar', 'titanium_sheet'],
    ['titanium_bar', 'titanium_beam'],
    ['wolfram_ore', 'wolfram_bar'],
    ['wolfram_bar', 'wolfram_plate'],
    ['wolfram_bar', 'wolfram_powder'],
    ['wolfram_bar', 'wolfram_wire']
  ]);
  const [optimizationAttempts, setOptimizationAttempts] = useState<number>(500);
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  // Genetic Algorithm Config
  const [gaParams, setGaParams] = useState<GAParams['weights']>({
    constraints: 2000,
    split: 1000,
    balance: 5000,
    transport: 1
  });
  const [gaGenerations, setGaGenerations] = useState(150);
  const [minClusterSize, setMinClusterSize] = useState(4);
  const [maxClusterSize, setMaxClusterSize] = useState(12);

  // New: Start with 30 tries for GA
  const [gaAttempts, setGaAttempts] = useState(50);

  // Dimensions
  const [dimensions, setDimensions] = useState({ width: 1000, height: 600 });

  useEffect(() => {
    const handleResize = () => {
      const sidebarWidth = isMenuOpen ? 320 : 0;
      setDimensions({
        width: window.innerWidth - sidebarWidth,
        height: window.innerHeight
      });
    };
    window.addEventListener('resize', handleResize);
    handleResize(); // Initial calc
    return () => window.removeEventListener('resize', handleResize);
  }, [isMenuOpen]);

  const addTarget = () => {
    const defaultId = allProducts[0] || 'turbine';
    let defaultAmount = 60;

    // smart default amount
    const found = buildings.flatMap(b => b.recipes || []).find(r => r.output.id === defaultId);
    if (found) {
      defaultAmount = found.output.amount_per_minute;
    }

    setTargets([...targets, { key: uuidv4(), id: defaultId, amount: defaultAmount }]);
  };

  const removeTarget = (key: string) => {
    setTargets(targets.filter(t => t.key !== key));
  };

  const updateTarget = (key: string, field: 'id' | 'amount', value: string | number) => {
    setTargets(targets.map(t => {
      if (t.key === key) {
        const newTarget = { ...t, [field]: value };

        // Auto-update amount if ID changes
        if (field === 'id') {
          const found = buildings.flatMap(b => b.recipes || []).find(r => r.output.id === value);
          if (found) {
            newTarget.amount = found.output.amount_per_minute;
          }
        }
        return newTarget;
      }
      return t;
    }));
  };

  // Helper to get all known items for dropdown
  const allItems = useMemo(() => {
    const items = new Set<string>();
    buildings.forEach(b => {
      b.recipes?.forEach(r => {
        items.add(r.output.id);
        r.inputs.forEach(i => items.add(i.id));
      });
    });
    return Array.from(items).sort();
  }, [buildings]);

  // Co-Location Inputs
  const [constraintA, setConstraintA] = useState('');
  const [constraintB, setConstraintB] = useState('');

  const addConstraint = () => {
    if (constraintA && constraintB && constraintA !== constraintB) {
      setConstraints([...constraints, [constraintA, constraintB]]);
      setConstraintA('');
      setConstraintB('');
    }
  };

  const removeConstraint = (index: number) => {
    setConstraints(constraints.filter((_, i) => i !== index));
  };

  // Split-Location Inputs
  const [splitA, setSplitA] = useState('');
  const [splitB, setSplitB] = useState('');

  const addSplitConstraint = () => {
    if (splitA && splitB && splitA !== splitB) {
      setSplitConstraints([...splitConstraints, [splitA, splitB]]);
      setSplitA('');
      setSplitB('');
    }
  };

  const removeSplitConstraint = (index: number) => {
    setSplitConstraints(splitConstraints.filter((_, i) => i !== index));
  };

  const sankeyData = useMemo(() => {
    try {
      if (targets.length === 0) return { nodes: [], links: [] };
      return calculateRequirements(buildings, targets);
    } catch (e) {
      console.error("Sankey Calculation Error:", e);
      return { nodes: [], links: [] };
    }
  }, [targets]);

  const handleRunKMeans = async () => {
    setIsOptimizing(true);
    setTimeout(async () => {
      try {
        const res = await optimizeLayout(buildings, targets, numClusters, splitConstraints, constraints, optimizationAttempts);
        setOptimizationResult(res);
      } catch (e) {
        console.error("Optimization Error:", e);
        alert("Optimization failed. Check console.");
      } finally {
        setIsOptimizing(false);
      }
    }, 100);
  };



  if (!buildings || buildings.length === 0) {
    return <div style={{ padding: 20 }}>Error: No recipe data loaded.</div>;
  }

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'row', overflow: 'hidden', background: '#121212', color: '#e0e0e0', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* SIDEBAR */}
      <div style={{
        width: isMenuOpen ? 320 : 0,
        opacity: isMenuOpen ? 1 : 0,
        transition: 'all 0.3s ease',
        background: '#1a1a1a',
        borderRight: '1px solid #333',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        whiteSpace: 'nowrap'
      }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid #333', background: '#222' }}>
          <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: '#fff', letterSpacing: 0.5 }}>STAR RUPTURE OPTIMIZER</h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* Section: Targets */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Production Targets</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {targets.map((t) => (
                <div key={t.key} style={{ display: 'flex', gap: 8, alignItems: 'center', background: '#2a2a2a', padding: '6px 10px', borderRadius: 6, border: '1px solid #333' }}>
                  <select
                    value={t.id}
                    onChange={(e) => updateTarget(t.key, 'id', e.target.value)}
                    style={{ flex: 1, minWidth: 0, background: '#1c1c1c', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 13, outline: 'none', cursor: 'pointer' }}
                  >
                    {allProducts.map(p => (
                      <option key={p} value={p} style={{ background: '#1c1c1c', color: '#fff' }}>
                        {p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={t.amount}
                    onChange={(e) => updateTarget(t.key, 'amount', Number(e.target.value))}
                    min="1"
                    style={{ width: 45, background: '#1c1c1c', border: '1px solid #444', color: '#fff', padding: '2px 4px', borderRadius: 4, textAlign: 'center', fontSize: 13 }}
                  />
                  <button
                    onClick={() => removeTarget(t.key)}
                    style={{ padding: '4px', background: 'transparent', border: 'none', color: '#666', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center' }}
                    onMouseOver={(e) => e.currentTarget.style.color = '#ff5555'}
                    onMouseOut={(e) => e.currentTarget.style.color = '#666'}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                onClick={addTarget}
                style={{ padding: '8px', background: 'transparent', border: '1px dashed #444', color: '#888', cursor: 'pointer', borderRadius: 4, fontSize: 12, transition: 'all 0.2s', width: '100%' }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = '#666'; e.currentTarget.style.color = '#ccc'; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#888'; }}
              >
                + Add Target
              </button>
            </div>
          </div>

          {/* Section: Global Settings */}
          <div>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#666', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Global Settings</div>

            <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#ccc', marginBottom: 16 }}>
              <span>Target Bases (Clusters)</span>
              <input
                type="number"
                min="1"
                max="20"
                value={numClusters}
                onChange={e => setNumClusters(Math.max(1, parseInt(e.target.value) || 1))}
                style={{ width: 50, background: '#1c1c1c', border: '1px solid #444', borderRadius: 4, color: '#fff', textAlign: 'center', padding: '4px' }}
              />
            </label>

            {/* Co-Location Constraints */}
            <div style={{ background: '#2a2a2a', padding: 12, borderRadius: 6, marginBottom: 12, border: '1px solid #333' }}>
              <div style={{ fontSize: 12, color: '#aaa', marginBottom: 8, fontWeight: 500 }}>Co-Location Constraints</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                <select
                  style={{ flex: 1, background: '#1c1c1c', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 11, width: '40%' }}
                  value={constraintA}
                  onChange={e => setConstraintA(e.target.value)}
                >
                  <option value="" style={{ background: '#1c1c1c', color: '#fff' }}>Item A</option>
                  {allItems.map(i => <option key={`a-${i}`} value={i} style={{ background: '#1c1c1c', color: '#fff' }}>{i}</option>)}
                </select>
                <span style={{ color: '#666', fontSize: 12, alignSelf: 'center' }}>+</span>
                <select
                  style={{ flex: 1, background: '#1c1c1c', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 11, width: '40%' }}
                  value={constraintB}
                  onChange={e => setConstraintB(e.target.value)}
                >
                  <option value="" style={{ background: '#1c1c1c', color: '#fff' }}>Item B</option>
                  {allItems.map(i => <option key={`b-${i}`} value={i} style={{ background: '#1c1c1c', color: '#fff' }}>{i}</option>)}
                </select>
                <button onClick={addConstraint} style={{ fontSize: 14, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center' }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {constraints.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, background: '#1c1c1c', padding: '4px 8px', borderRadius: 4, border: '1px solid #333' }}>
                    <span style={{ color: '#ccc' }}>{c[0]} & {c[1]}</span>
                    <span onClick={() => removeConstraint(i)} style={{ cursor: 'pointer', color: '#ff5555' }}>×</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Split-Location Constraints (RED) */}
            <div style={{ background: '#2a1a1a', padding: 12, borderRadius: 6, marginBottom: 12, border: '1px solid #442222' }}>
              <div style={{ fontSize: 12, color: '#f88', marginBottom: 8, fontWeight: 500 }}>Split Location Constraints</div>
              <div style={{ display: 'flex', gap: 5, marginBottom: 8 }}>
                <select
                  style={{ flex: 1, background: '#1c1c1c', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 11, width: '40%' }}
                  value={splitA}
                  onChange={e => setSplitA(e.target.value)}
                >
                  <option value="" style={{ background: '#1c1c1c', color: '#fff' }}>Item A</option>
                  {allItems.map(i => <option key={`sa-${i}`} value={i} style={{ background: '#1c1c1c', color: '#fff' }}>{i}</option>)}
                </select>
                <span style={{ color: '#f88', fontSize: 12, alignSelf: 'center' }}>/</span>
                <select
                  style={{ flex: 1, background: '#1c1c1c', color: '#ccc', border: '1px solid #444', borderRadius: 4, padding: '4px 8px', fontSize: 11, width: '40%' }}
                  value={splitB}
                  onChange={e => setSplitB(e.target.value)}
                >
                  <option value="" style={{ background: '#1c1c1c', color: '#fff' }}>Item B</option>
                  {allItems.map(i => <option key={`sb-${i}`} value={i} style={{ background: '#1c1c1c', color: '#fff' }}>{i}</option>)}
                </select>
                <button onClick={addSplitConstraint} style={{ fontSize: 14, background: '#ef4444', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', padding: '0 10px', display: 'flex', alignItems: 'center' }}>+</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {splitConstraints.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, background: '#1c1c1c', padding: '4px 8px', borderRadius: 4, border: '1px solid #333' }}>
                    <span style={{ color: '#f88' }}>{c[0]} != {c[1]}</span>
                    <span onClick={() => removeSplitConstraint(i)} style={{ cursor: 'pointer', color: '#ff5555' }}>×</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{ flex: 1, position: 'relative', display: 'flex', flexDirection: 'column', background: '#0f0f0f' }}>

        {/* Top Header / Toolbar */}
        <div style={{ height: 60, background: '#1a1a1a', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', padding: '0 24px', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              style={{ background: 'transparent', border: '1px solid #444', color: '#ccc', borderRadius: 4, padding: '6px 12px', cursor: 'pointer', fontSize: 13, transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <span style={{ fontSize: 10 }}>{isMenuOpen ? '◀' : '▶'}</span> {isMenuOpen ? 'Hide Menu' : 'Show Menu'}
            </button>

            <div style={{ display: 'flex', background: '#111', borderRadius: 6, padding: 3, border: '1px solid #333' }}>
              <button
                onClick={() => setView('sankey')}
                style={{ padding: '6px 16px', background: view === 'sankey' ? '#333' : 'transparent', color: view === 'sankey' ? '#fff' : '#666', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                Flow Chart
              </button>
              <button
                onClick={() => setView('kmeans')}
                style={{ padding: '6px 16px', background: view === 'kmeans' ? '#3b82f6' : 'transparent', color: view === 'kmeans' ? '#fff' : '#666', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                K-Means Optimizer
              </button>
              <button
                onClick={() => setView('genetic')}
                style={{ padding: '6px 16px', background: view === 'genetic' ? '#8b5cf6' : 'transparent', color: view === 'genetic' ? '#fff' : '#666', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
              >
                Genetic Optimizer
              </button>
            </div>
          </div>

          {/* Stats Overlay: Now includes Cross-Border Transport */}
          <div style={{ fontSize: 12, color: '#666', display: 'flex', gap: 16, alignItems: 'center', background: '#222', padding: '6px 12px', borderRadius: 20 }}>
            {/* Show Stats if available */}
            {optimizationResult?.stats ? (
              <>
                <span style={{ color: '#ddd' }}>Total Transport: <strong style={{ color: '#4ade80' }}>{Math.round(optimizationResult.stats.totalCrossFlow)}</strong> / min</span>
                <span style={{ color: '#444' }}>|</span>
              </>
            ) : null}
            <span><strong>{numClusters}</strong> BASES</span>
            <span style={{ color: '#444' }}>|</span>
            <span><strong>{constraints.length + splitConstraints.length}</strong> RULES</span>
          </div>
        </div>

        {/* Contextual Toolbar */}
        {view !== 'sankey' && (
          <div style={{ background: '#181818', borderBottom: '1px solid #333', padding: '10px 24px', display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>

            {view === 'kmeans' && (
              <>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <label style={{ fontSize: 13, color: '#aaa' }}>Optimization Tries:</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={optimizationAttempts}
                    onChange={e => setOptimizationAttempts(Math.max(1, parseInt(e.target.value) || 1))}
                    style={{ width: 50, background: '#222', border: '1px solid #444', borderRadius: 4, color: '#fff', textAlign: 'center', padding: '4px' }}
                  />
                </div>
                <button
                  onClick={handleRunKMeans}
                  disabled={isOptimizing || targets.length === 0}
                  style={{ padding: '8px 16px', background: isOptimizing ? '#333' : '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: isOptimizing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem' }}
                >
                  {isOptimizing ? 'Optimizing...' : 'Run K-Means'}
                </button>
              </>
            )}

            {view === 'genetic' && (
              <>
                <div style={{ display: 'flex', gap: 15, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Generations</label>
                    <input type="number" value={gaGenerations} onChange={e => setGaGenerations(Number(e.target.value))} style={{ width: 50, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Min Size</label>
                    <input type="number" value={minClusterSize} onChange={e => setMinClusterSize(Number(e.target.value))} style={{ width: 40, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Max Size</label>
                    <input type="number" value={maxClusterSize} onChange={e => setMaxClusterSize(Number(e.target.value))} style={{ width: 40, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>

                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Optimization Tries</label>
                    <input type="number" value={gaAttempts} onChange={e => setGaAttempts(Number(e.target.value))} style={{ width: 50, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                  <div style={{ width: 1, height: 30, background: '#333', margin: '0 5px' }}></div>

                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Link Penalty</label>
                    <input type="number" value={gaParams.constraints} onChange={e => setGaParams({ ...gaParams, constraints: Number(e.target.value) })} style={{ width: 50, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Split Penalty</label>
                    <input type="number" value={gaParams.split} onChange={e => setGaParams({ ...gaParams, split: Number(e.target.value) })} style={{ width: 50, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexDirection: 'column' }}>
                    <label style={{ fontSize: 11, color: '#aaa' }}>Balance Penalty</label>
                    <input type="number" value={gaParams.balance} onChange={e => setGaParams({ ...gaParams, balance: Number(e.target.value) })} style={{ width: 50, background: '#222', border: '1px solid #444', color: '#fff', padding: 2, borderRadius: 3 }} />
                  </div>
                </div>
                <button
                  onClick={async () => {
                    setIsOptimizing(true);
                    setTimeout(async () => {
                      try {
                        const params: GAParams = {
                          populationSize: 100,
                          generations: gaGenerations,
                          mutationRate: 0.1,
                          numClusters: numClusters,
                          weights: gaParams,
                          constraints: constraints,
                          splitConstraints: splitConstraints,
                          minClusterSize: minClusterSize,
                          maxClusterSize: maxClusterSize
                        };
                        const res = await runGeneticOptimization(buildings, targets, params, gaAttempts);
                        setOptimizationResult(res);
                      } catch (e) {
                        console.error("GA Error:", e);
                        alert("Genetic Optimization failed Check console for details.");
                      } finally {
                        setIsOptimizing(false);
                      }
                    }, 100);
                  }}
                  disabled={isOptimizing || targets.length === 0}
                  style={{ padding: '8px 16px', background: isOptimizing ? '#333' : '#8b5cf6', color: '#fff', border: 'none', borderRadius: 6, cursor: isOptimizing ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.85rem', marginLeft: 'auto' }}
                >
                  {isOptimizing ? 'Evolving...' : 'Run Genetic Algorithm'}
                </button>
              </>
            )}
          </div>
        )}

        {/* Visualization Area */}
        <div style={{ flex: 1, position: 'relative', background: '#0f0f0f', overflow: 'hidden' }}>
          {view === 'sankey' ? (
            sankeyData.nodes.length > 0 ? (
              <SankeyChart
                data={sankeyData}
                width={dimensions.width}
                height={dimensions.height - 60}
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#444' }}>
                Configuration needed. Add a target in the menu.
              </div>
            )
          ) : (
            optimizationResult ? (
              <ClusterDiagram
                result={optimizationResult}
                width={dimensions.width}
                height={dimensions.height - 110}
              />
            ) : (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#444', flexDirection: 'column', gap: 10 }}>
                <p>No optimizer results yet.</p>
                <p style={{ fontSize: '0.9em', opacity: 0.7 }}>Select an algorithm above and click Run.</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
