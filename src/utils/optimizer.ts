import { forceSimulation, forceLink, forceManyBody, forceCenter, type SimulationNodeDatum } from 'd3-force';
import { calculateRequirements } from './calculations';
import type { Buildings, MachineNode, MachineLink, OptimizerResult } from '../types';

export const optimizeLayout = (
    buildings: Buildings,
    targets: { id: string; amount: number }[],
    numClusters: number = 3,
    splitConstraints: [string, string][] = [],
    constraints: [string, string][] = [],
    attempts: number = 20
): Promise<OptimizerResult> => {
    return new Promise((resolve) => {
        // 1. Calculate Sankey Flow
        const { nodes: rawNodes, links: rawLinks } = calculateRequirements(buildings, targets);

        const nodes: MachineNode[] = rawNodes.map(n => ({
            id: n.name,
            name: n.name,
            buildingId: n.category,
            recipeOutputId: n.name,
            requiredAmount: n.requiredAmount,
            outputPerMachine: n.outputPerMachine,
            machineName: n.machineName,
            category: n.category
        }));

        const links: MachineLink[] = rawLinks.map(l => ({
            source: l.source,
            target: l.target,
            value: l.value
        }));

        // 2. Physics Simulation (Force-Directed Layout)
        // We use this to establish "spatial locality" based on connections
        // Co-located items get a strong link.

        // Clone links for simulation so we don't mutate the 'links' array's source/target types unexpectedly yet
        const simLinks: any[] = links.map(l => ({ ...l }));

        // Add Constraint Links (Strong attraction)
        constraints.forEach(([a, b]) => {
            if (nodes.find(n => n.id === a) && nodes.find(n => n.id === b)) {
                simLinks.push({ source: a, target: b, value: 1000, type: 'constraint' });
            }
        });

        const simulation = forceSimulation(nodes as SimulationNodeDatum[])
            .force("link", forceLink(simLinks).id((d: any) => d.id).distance((d: any) => {
                if (d.type === 'constraint') return 5; // Very close
                return 100; // Normal distance
            }))
            .force("charge", forceManyBody().strength(-300))
            .force("center", forceCenter(0, 0));

        // Run simulation to settle nodes
        simulation.stop();
        for (let i = 0; i < 300; ++i) simulation.tick();

        // 3. K-Means Clustering
        const items = nodes.filter(n => n.category !== 'sink'); // Filter out virtual nodes if any

        if (items.length > 0) {
            const k = Math.min(numClusters, items.length);

            let bestNodeClusterMap = new Map<string, number>();
            let bestScore = Infinity;

            for (let pass = 0; pass < attempts; pass++) {
                // Init Centroids (Random Points)
                const shuffled = [...items].sort(() => 0.5 - Math.random());
                let centroids = shuffled.slice(0, k).map(n => ({ x: n.x!, y: n.y! }));

                let hasChanged = true;
                let iterations = 0;
                let clusterAssignment = new Map<string, number>();

                while (hasChanged && iterations < 50) {
                    hasChanged = false;
                    const newClusters = new Map<string, number>();
                    const clusterSums = new Array(k).fill(0).map(() => ({ x: 0, y: 0, count: 0 }));

                    items.forEach(node => {
                        let closest = -1;
                        let minDist = Infinity;

                        centroids.forEach((c, idx) => {
                            const dx = node.x! - c.x;
                            const dy = node.y! - c.y;
                            const d = dx * dx + dy * dy;
                            if (d < minDist) {
                                minDist = d;
                                closest = idx;
                            }
                        });

                        newClusters.set(node.id, closest);
                        clusterSums[closest].x += node.x!;
                        clusterSums[closest].y += node.y!;
                        clusterSums[closest].count++;

                        if (closest !== clusterAssignment.get(node.id)) hasChanged = true;
                    });

                    clusterAssignment = newClusters;
                    centroids = clusterSums.map(c => c.count > 0 ? { x: c.x / c.count, y: c.y / c.count } : { x: 0, y: 0 }); // Todo: Handle empty
                    iterations++;
                }

                // Eval Score (Cross-Flow + Penalties)
                let currentScore = 0;
                let crossFlow = 0;

                // Check Transport
                links.forEach(l => {
                    // Links source/target are strings at this point usually? 
                    // Wait, calculateRequirements returns strings.
                    // We mapped them to strings in `links` array above.
                    // D3 simulation only ran on `simLinks`. original `links` is untouched?
                    // NOTE: d3 forceLink MIGHT mutate the objects passed to it. We passed `simLinks`.
                    // So `links` should still be { source: string, target: string, value: number }.

                    const sId = l.source as unknown as string;
                    const tId = l.target as unknown as string;
                    const sC = clusterAssignment.get(sId);
                    const tC = clusterAssignment.get(tId);

                    if (sC !== undefined && tC !== undefined && sC !== tC) {
                        crossFlow += l.value;
                    }
                });
                currentScore += crossFlow;

                // Check Split Constraints
                splitConstraints.forEach(([a, b]) => {
                    const cA = clusterAssignment.get(a);
                    const cB = clusterAssignment.get(b);
                    if (cA !== undefined && cB !== undefined && cA === cB) {
                        currentScore += 10000; // Huge penalty
                    }
                });

                if (currentScore < bestScore) {
                    bestScore = currentScore;
                    bestNodeClusterMap = clusterAssignment;
                }
            }

            // Apply Best
            nodes.forEach(n => {
                const c = bestNodeClusterMap.get(n.id);
                n.clusterId = c !== undefined ? c : 0;
            });
        }

        // 4. Final Result Construction
        const clusters = new Map<number, MachineNode[]>();
        nodes.forEach(n => {
            if (n.clusterId !== undefined) {
                if (!clusters.has(n.clusterId)) clusters.set(n.clusterId, []);
                clusters.get(n.clusterId)!.push(n);
            }
        });

        // Calculate Stats
        // We re-calculate cross flow for the final assignment
        let totalCrossFlow = 0;
        const nodeClusterMap = new Map(nodes.map(n => [n.id, n.clusterId]));

        links.forEach(l => {
            const sId = l.source as unknown as string;
            const tId = l.target as unknown as string;
            const sC = nodeClusterMap.get(sId);
            const tC = nodeClusterMap.get(tId);

            if (sC !== undefined && tC !== undefined && sC !== tC) {
                totalCrossFlow += l.value;
            }
        });

        resolve({
            nodes,
            links,
            clusters,
            stats: { totalCrossFlow }
        });
    });
};
