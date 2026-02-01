import React, { useMemo } from 'react';
import ReactFlow, {
    Background,
    Controls,
    type Node,
    type Edge,
    MarkerType,
    useNodesState,
    useEdgesState
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { OptimizerResult } from '../types';
import dagre from 'dagre';

interface ClusterDiagramProps {
    result: OptimizerResult;
    width: number;
    height: number;
}

const colors = [
    'rgba(255, 0, 0, 0.1)',
    'rgba(0, 255, 0, 0.1)',
    'rgba(0, 0, 255, 0.1)',
    'rgba(255, 255, 0, 0.1)',
    'rgba(0, 255, 255, 0.1)',
    'rgba(255, 0, 255, 0.1)',
];

export const ClusterDiagram: React.FC<ClusterDiagramProps> = ({ result, width, height }) => {
    // We don't use the intermediate state for layout because the optimizer provided coordinates.
    // However, we need to convert OptimizerResult to ReactFlow elements.

    const { elements } = useMemo(() => {
        const nodes: Node[] = [];
        const edges: Edge[] = [];

        if (!result) return { elements: [] };

        // --- PASS 1: Base Dimensions & Internal Layouts ---

        // Map to store per-cluster layout data
        // Key: clusterId, Value: { graph: dagre.Graph, width: number, height: number, aggMap: Map }
        const clusterLayouts = new Map<number, any>();

        result.clusters.forEach((clusterNodes, clusterId) => {
            const g = new dagre.graphlib.Graph();
            g.setGraph({ rankdir: 'TB', marginx: 40, marginy: 40, ranksep: 80, nodesep: 60 });
            g.setDefaultEdgeLabel(() => ({}));

            // Aggregate machines logic
            interface AggregatedMachine {
                key: string;
                count: number;
                nodeIds: string[];
                baseNode: any;
            }
            const aggMap = new Map<string, AggregatedMachine>();

            clusterNodes.forEach(n => {
                const key = `${n.buildingId}|${n.recipeOutputId || ''}`;
                const entry = aggMap.get(key);
                if (entry) {
                    entry.count++;
                    entry.nodeIds.push(n.id);
                } else {
                    aggMap.set(key, { key, count: 1, nodeIds: [n.id], baseNode: { ...n } });
                }
            });

            // Add nodes to internal graph
            aggMap.forEach(agg => {
                g.setNode(agg.nodeIds[0], { width: 140, height: 80 }); // Slightly larger for labels
            });

            // Internal edges
            const internalNodeIds = new Set(clusterNodes.map(n => n.id));
            const visualIdMap = new Map<string, string>();
            clusterNodes.forEach(n => {
                const key = `${n.buildingId}|${n.recipeOutputId || ''}`;
                visualIdMap.set(n.id, aggMap.get(key)!.nodeIds[0]);
            });

            result.links.forEach(l => {
                const sId = (typeof l.source === 'object' ? (l.source as any).id : l.source) as string;
                const tId = (typeof l.target === 'object' ? (l.target as any).id : l.target) as string;
                if (internalNodeIds.has(sId) && internalNodeIds.has(tId)) {
                    const vSource = visualIdMap.get(sId);
                    const vTarget = visualIdMap.get(tId);
                    if (vSource && vTarget && vSource !== vTarget) {
                        g.setEdge(vSource, vTarget);
                    }
                }
            });

            dagre.layout(g);

            // Calculate dimensions relative to (0,0)
            let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
            g.nodes().forEach(v => {
                const n = g.node(v);
                minX = Math.min(minX, n.x - n.width / 2);
                maxX = Math.max(maxX, n.x + n.width / 2);
                minY = Math.min(minY, n.y - n.height / 2);
                maxY = Math.max(maxY, n.y + n.height / 2);
            });

            // If empty cluster
            if (minX === Infinity) { minX = 0; maxX = 100; minY = 0; maxY = 100; }

            const LEFT_SIDEBAR_WIDTH = 220; // Space for Summary Node on the left
            const width = (maxX - minX) + 80 + LEFT_SIDEBAR_WIDTH; // Add sidebar space
            const height = (maxY - minY) + 80;

            clusterLayouts.set(clusterId, { g, width, height, minX, minY, aggMap, sidebarWidth: LEFT_SIDEBAR_WIDTH });
        });

        // --- PASS 2: Meta-Layout (Clusters) ---

        const metaG = new dagre.graphlib.Graph();
        metaG.setGraph({ rankdir: 'LR', marginx: 50, marginy: 50, ranksep: 200, nodesep: 100 });
        metaG.setDefaultEdgeLabel(() => ({}));

        // Add Clusters as nodes
        clusterLayouts.forEach((info, clusterId) => {
            metaG.setNode(clusterId.toString(), { width: info.width, height: info.height });
        });

        // Add edges between clusters (aggregated flow)
        const clusterFlows = new Map<string, number>();
        result.links.forEach((l) => {
            const sId = (typeof l.source === 'object' ? (l.source as any).id : l.source) as string;
            const tId = (typeof l.target === 'object' ? (l.target as any).id : l.target) as string;
            const sNode = result.nodes.find(n => n.id === sId);
            const tNode = result.nodes.find(n => n.id === tId);

            if (sNode && tNode && sNode.clusterId !== undefined && tNode.clusterId !== undefined && sNode.clusterId !== tNode.clusterId) {
                const key = `${sNode.clusterId}->${tNode.clusterId}`;
                clusterFlows.set(key, (clusterFlows.get(key) || 0) + l.value);
            }
        });

        clusterFlows.forEach((_, key) => {
            const [s, t] = key.split('->');
            metaG.setEdge(s, t);
        });

        dagre.layout(metaG);

        // --- RENDER ---

        clusterLayouts.forEach((info, clusterId) => {
            const metaNode = metaG.node(clusterId.toString());
            // Top-left of the cluster box
            const clusterX = metaNode.x - metaNode.width / 2;
            const clusterY = metaNode.y - metaNode.height / 2;

            // 1. Group Node
            nodes.push({
                id: `cluster-${clusterId}`,
                type: 'group',
                data: { label: `Base ${clusterId + 1}` },
                position: { x: clusterX, y: clusterY },
                style: {
                    width: info.width,
                    height: info.height,
                    backgroundColor: colors[clusterId % colors.length],
                    border: '2px dashed #777',
                    borderRadius: 10
                }
            });

            // 2. Summary Node (Top Left corner)
            const machines: string[] = [];

            // Data Structures for Granular Stats
            // Material -> Source Cluster ID -> Amount
            const importsMap = new Map<string, Map<number, number>>();
            // Material -> Target Cluster ID -> Amount
            const exportsMap = new Map<string, Map<number, number>>();

            const clusterNodes = result.clusters.get(clusterId) || [];
            clusterNodes.forEach(n => {
                if (n.outputPerMachine && n.requiredAmount) {
                    const count = (n.requiredAmount / n.outputPerMachine).toFixed(1);
                    const machineName = n.machineName || n.buildingId || 'Machine';
                    const machineNameFormatted = machineName.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    const itemNameFormatted = n.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                    machines.push(`${machineNameFormatted} (${itemNameFormatted}): ${count}`);
                }
            });

            // Calc imports/exports with Source/Dest details
            result.links.forEach(l => {
                const sId = (typeof l.source === 'object' ? (l.source as any).id : l.source) as string;
                const tId = (typeof l.target === 'object' ? (l.target as any).id : l.target) as string;
                const sNode = result.nodes.find(n => n.id === sId);
                const tNode = result.nodes.find(n => n.id === tId);

                // Try to resolve the actual item name from the source node 
                // (Links in our graph are Item->Item mostly, so sNode.name is the item)
                const itemName = sNode ? sNode.name : 'Unknown';

                if (sNode && tNode) {
                    // Import: From Other -> Me
                    if (sNode.clusterId !== clusterId && tNode.clusterId === clusterId) {
                        if (!importsMap.has(itemName)) importsMap.set(itemName, new Map());
                        const srcMap = importsMap.get(itemName)!;
                        const srcCId = sNode.clusterId !== undefined ? sNode.clusterId : -1;
                        srcMap.set(srcCId, (srcMap.get(srcCId) || 0) + l.value);
                    }

                    // Export: From Me -> Other
                    if (sNode.clusterId === clusterId && tNode.clusterId !== clusterId) {
                        if (!exportsMap.has(itemName)) exportsMap.set(itemName, new Map());
                        const destMap = exportsMap.get(itemName)!;
                        const destCId = tNode.clusterId !== undefined ? tNode.clusterId : -1;
                        destMap.set(destCId, (destMap.get(destCId) || 0) + l.value);
                    }
                }
            });

            // Prepare Export Matrix Headers (All other clusters)
            const allClusterIds = Array.from(clusterLayouts.keys()).filter(id => id !== clusterId).sort((a, b) => a - b);

            // Helper to render Import List
            const renderImports = () => {
                const items = Array.from(importsMap.keys()).sort();
                if (items.length === 0) return <div style={{ color: '#888', fontStyle: 'italic' }}>None</div>;

                return items.map(item => {
                    const srcMap = importsMap.get(item)!;
                    const sources = Array.from(srcMap.entries()).map(([cId, val]) =>
                        `B${cId + 1}: ${Math.round(val)}`
                    ).join(', ');
                    const total = Array.from(srcMap.values()).reduce((a, b) => a + b, 0);

                    return (
                        <div key={item} style={{ marginBottom: 2 }}>
                            <span style={{ color: '#AED6F1' }}>{item}</span>: {Math.round(total)} <span style={{ color: '#aaa', fontSize: 9 }}>({sources})</span>
                        </div>
                    );
                });
            };

            // Helper to render Export Table
            const renderExportTable = () => {
                const items = Array.from(exportsMap.keys()).sort();
                if (items.length === 0) return <div style={{ color: '#888', fontStyle: 'italic' }}>None</div>;

                return (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 9, marginTop: 4 }}>
                        <thead>
                            <tr>
                                <th style={{ textAlign: 'left', borderBottom: '1px solid #555', padding: '2px', color: '#aaa' }}>Mat</th>
                                {allClusterIds.map(cid => (
                                    <th key={cid} style={{ borderBottom: '1px solid #555', padding: '2px', color: '#aaa', width: '25px', textAlign: 'center' }}>B{cid + 1}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {items.map(item => {
                                const destMap = exportsMap.get(item)!;
                                return (
                                    <tr key={item}>
                                        <td style={{ padding: '2px', color: '#F5B7B1' }}>{item}</td>
                                        {allClusterIds.map(cid => {
                                            const val = destMap.get(cid) || 0;
                                            return (
                                                <td key={cid} style={{ padding: '2px', textAlign: 'center', color: val > 0 ? '#fff' : '#444' }}>
                                                    {val > 0 ? Math.round(val) : '-'}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                );
            };

            nodes.push({
                id: `summary-${clusterId}`,
                type: 'default',
                data: {
                    label: (
                        <div style={{ textAlign: 'left', fontSize: 10, width: '100%' }}>
                            <div style={{ fontWeight: 'bold', fontSize: 11, borderBottom: '1px solid #666', paddingBottom: 4, marginBottom: 4 }}>
                                BASE {clusterId + 1} OVERVIEW
                            </div>

                            <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: '#ccc' }}>MACHINES</strong>
                                <div style={{ paddingLeft: 4, color: '#eee' }}>
                                    {machines.length > 0 ? machines.map(m => <div key={m}>{m}</div>) : <span style={{ color: '#666' }}>No production</span>}
                                </div>
                            </div>

                            <div style={{ marginBottom: 8 }}>
                                <strong style={{ color: '#ccc' }}>IMPORTS (from)</strong>
                                <div style={{ paddingLeft: 4 }}>
                                    {renderImports()}
                                </div>
                            </div>

                            <div>
                                <strong style={{ color: '#ccc' }}>EXPORTS (to)</strong>
                                <div>
                                    {renderExportTable()}
                                </div>
                            </div>
                        </div>
                    )
                },
                position: { x: 10, y: 10 },
                parentNode: `cluster-${clusterId}`,
                extent: 'parent',
                // Increased width for table
                style: { width: 200, background: 'rgba(20, 20, 20, 0.85)', color: '#fff', border: '1px solid #444', height: 'auto', padding: 8 }
            });


            // 3. Machine Nodes
            info.aggMap.forEach((agg: any) => {
                const n = agg.baseNode;
                const dNode = info.g.node(agg.nodeIds[0]);

                const relX = (dNode.x - dNode.width / 2) - info.minX + 40 + info.sidebarWidth; // Shift Right
                const relY = (dNode.y - dNode.height / 2) - info.minY + 40; // No vertical shift

                const outputName = n.recipeOutputId ? n.recipeOutputId.replace(/_/g, ' ') : n.buildingId;
                const rate = n.requiredAmount ? n.requiredAmount.toFixed(1) : '0';
                const machineCount = (n.outputPerMachine && n.requiredAmount)
                    ? Math.ceil(n.requiredAmount / n.outputPerMachine)
                    : '1';
                const buildingName = (n.machineName || n.buildingId || 'Machine').replace(/_/g, ' ');

                const label = (
                    <div style={{ lineHeight: '1.2' }}>
                        <div style={{ fontWeight: 600, borderBottom: '1px solid #555', paddingBottom: 2, marginBottom: 2 }}>
                            {outputName.replace(/\b\w/g, (l: string) => l.toUpperCase())} <span style={{ color: '#aaa', fontSize: '0.9em' }}>×{rate}/min</span>
                        </div>
                        <div style={{ color: '#ccc', fontStyle: 'italic' }}>
                            {buildingName} ×{machineCount}
                        </div>
                    </div>
                );

                nodes.push({
                    id: agg.nodeIds[0],
                    type: 'default',
                    data: { label: label },
                    position: { x: relX, y: relY },
                    parentNode: `cluster-${clusterId}`,
                    extent: 'parent',
                    style: {
                        background: '#222',
                        color: '#fff',
                        border: '1px solid #777',
                        fontSize: 10,
                        width: 160,
                        textAlign: 'center',
                        padding: 5
                    }
                });
            });
        });

        // Non-clustered nodes
        // Scale positions by meta-layout bounds if needed, or just place them off to side
        // Current logic: just append them where they are (0,0) or rely on old coords?
        // Let's place them below the graph for now
        let maxY = 0;
        metaG.nodes().forEach(v => maxY = Math.max(maxY, metaG.node(v).y + metaG.node(v).height));

        result.nodes.forEach(n => {
            if (n.clusterId === undefined) {
                nodes.push({
                    id: n.id,
                    data: { label: n.name },
                    position: { x: 0, y: maxY + 50 }, // Dump at bottom
                    style: { background: '#444', color: '#fff' }
                });
            }
        });

        // 4. Edges
        const maxFlow = Math.max(...result.links.map(lx => lx.value), 1);
        const getVisualId = (realId: string) => {
            const node = result.nodes.find(n => n.id === realId);
            if (!node || node.clusterId === undefined) return realId;
            const info = clusterLayouts.get(node.clusterId);
            if (!info) return realId;
            const key = `${node.buildingId}|${node.recipeOutputId || ''}`;
            return info.aggMap.get(key)?.nodeIds[0] || realId;
        };

        result.links.forEach(l => {
            const sId = (typeof l.source === 'object' ? (l.source as any).id : l.source) as string;
            const tId = (typeof l.target === 'object' ? (l.target as any).id : l.target) as string;

            edges.push({
                id: `e-${sId}-${tId}`,
                source: getVisualId(sId),
                target: getVisualId(tId),
                label: `${l.value.toFixed(1)}/min`,
                animated: true,
                style: {
                    stroke: '#fff',
                    strokeWidth: Math.max(1, (l.value / maxFlow) * 8)
                },
                markerEnd: { type: MarkerType.ArrowClosed, color: '#fff' },
            });
        });

        return { elements: [...nodes, ...edges] };
    }, [result]);

    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);

    // Sync elements to state
    React.useEffect(() => {
        const justNodes = elements.filter(e => !('source' in e));
        const justEdges = elements.filter(e => 'source' in e);
        setNodes(justNodes as Node[]);
        setEdges(justEdges as Edge[]);
    }, [elements, setNodes, setEdges]);

    return (
        <div style={{ width, height, border: '1px solid #444' }}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                fitView
            >
                <Background color="#555" gap={16} />
                <Controls />
            </ReactFlow>
        </div>
    );
};
