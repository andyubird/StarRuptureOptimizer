import type { Buildings, MachineNode, MachineLink, OptimizerResult } from '../types';
import { calculateRequirements } from './calculations';

export interface GAParams {
    populationSize: number;
    generations: number;
    mutationRate: number;
    numClusters: number;
    weights: {
        constraints: number; // Penalty for violating co-location
        split: number;       // Penalty for violating split-location (NEW)
        balance: number;     // Penalty for size limits
        transport: number;   // Penalty for inter-cluster connections
    };
    constraints: [string, string][]; // Co-location
    splitConstraints: [string, string][]; // Split-location (NEW)
    minClusterSize: number; // (NEW)
    maxClusterSize: number; // (NEW)
}

class GeneticOptimizer {
    private nodes: MachineNode[];
    private links: MachineLink[];
    private params: GAParams;
    private population: number[][]; // Each individual is an array of clusterIDs (index corresponds to node index)

    constructor(nodes: MachineNode[], links: MachineLink[], params: GAParams) {
        this.nodes = nodes;
        this.links = links;
        this.params = params;
        this.population = [];
    }

    // Initialize population with random assignments
    initialize() {
        this.population = [];
        for (let i = 0; i < this.params.populationSize; i++) {
            // Smart init? For now random is fine.
            const individual = this.nodes.map(() => Math.floor(Math.random() * this.params.numClusters));
            this.population.push(individual);
        }
    }

    // Calculate fitness (Lower is better - we are minimizing cost)
    calculateFitness(individual: number[]): number {
        let score = 0;
        const nodeIndexMap = new Map(this.nodes.map((n, i) => [n.id, i]));

        // 1. Transport Cost
        for (const link of this.links) {
            const sIdx = nodeIndexMap.get(link.source as string);
            const tIdx = nodeIndexMap.get(link.target as string);

            if (sIdx !== undefined && tIdx !== undefined) {
                if (individual[sIdx] !== individual[tIdx]) {
                    score += (link.value * this.params.weights.transport);
                }
            }
        }

        // 2. Co-Location Constraints (Must be TOGETHER)
        for (const [itemA, itemB] of this.params.constraints) {
            const idxA = this.nodes.findIndex(n => n.name === itemA);
            const idxB = this.nodes.findIndex(n => n.name === itemB);

            if (idxA !== -1 && idxB !== -1) {
                if (individual[idxA] !== individual[idxB]) {
                    score += this.params.weights.constraints;
                }
            }
        }

        // 3. Split-Location Constraints (Must be SEPARATE)
        for (const [itemA, itemB] of this.params.splitConstraints) {
            const idxA = this.nodes.findIndex(n => n.name === itemA);
            const idxB = this.nodes.findIndex(n => n.name === itemB);

            if (idxA !== -1 && idxB !== -1) {
                if (individual[idxA] === individual[idxB]) {
                    score += this.params.weights.split;
                }
            }
        }

        // 4. Cluster Size Limits
        const clusterCounts = new Array(this.params.numClusters).fill(0);
        individual.forEach(c => clusterCounts[c]++);

        for (const count of clusterCounts) {
            if (count > 0) { // Only check active clusters
                if (count < this.params.minClusterSize) {
                    score += (this.params.minClusterSize - count) * this.params.weights.balance;
                }
                if (count > this.params.maxClusterSize) {
                    score += (count - this.params.maxClusterSize) * this.params.weights.balance;
                }
            }
        }

        // Ensure we don't have empty clusters if we asked for N clusters
        // (Optional: depending on if user strictly wants N bases)
        const emptyClusters = clusterCounts.filter(c => c === 0).length;
        score += (emptyClusters * 500);

        return score;
    }

    evolve() {
        const newPopulation: number[][] = [];

        // Elitism: Keep best X%
        const sortedPop = this.population.map(ind => ({ ind, fitness: this.calculateFitness(ind) }))
            .sort((a, b) => a.fitness - b.fitness); // Ascending (min cost)

        // Keep top 10%
        const eliteCount = Math.max(2, Math.floor(this.params.populationSize * 0.1));
        newPopulation.push(...sortedPop.slice(0, eliteCount).map(p => p.ind));

        // Breeding
        while (newPopulation.length < this.params.populationSize) {
            // Tournament Selection
            const parentA = this.tournamentSelect(sortedPop);
            const parentB = this.tournamentSelect(sortedPop);

            // Crossover
            let child = this.crossover(parentA, parentB);

            // Mutation
            child = this.mutate(child);

            newPopulation.push(child);
        }

        this.population = newPopulation;
    }

    tournamentSelect(sortedPop: { ind: number[], fitness: number }[]): number[] {
        // Pick 4 random, return best
        const k = 4;
        let best = sortedPop[Math.floor(Math.random() * sortedPop.length)];

        for (let i = 0; i < k - 1; i++) {
            const candidate = sortedPop[Math.floor(Math.random() * sortedPop.length)];
            if (candidate.fitness < best.fitness) {
                best = candidate;
            }
        }
        return best.ind;
    }

    crossover(parentA: number[], parentB: number[]): number[] {
        // Uniform Crossover
        return parentA.map((gene, i) => Math.random() < 0.5 ? gene : parentB[i]);
    }

    mutate(individual: number[]): number[] {
        return individual.map(gene => {
            if (Math.random() < this.params.mutationRate) {
                return Math.floor(Math.random() * this.params.numClusters);
            }
            return gene;
        });
    }

    getBestResult(): { individual: number[], fitness: number } {
        let bestInd = this.population[0];
        let bestFit = Infinity;

        for (const ind of this.population) {
            const fit = this.calculateFitness(ind);
            if (fit < bestFit) {
                bestFit = fit;
                bestInd = ind;
            }
        }
        return { individual: bestInd, fitness: bestFit };
    }
}

export const runGeneticOptimization = async (
    buildings: Buildings,
    targets: { id: string; amount: number }[],
    params: GAParams,
    attempts: number = 1
): Promise<OptimizerResult> => {
    return new Promise((resolve) => {
        // 1. Data Prep
        const sankeyData = calculateRequirements(buildings, targets);
        const nodes: MachineNode[] = sankeyData.nodes.map(n => ({
            id: n.name,
            name: n.name,
            buildingId: n.category,
            recipeOutputId: n.name,
            requiredAmount: n.requiredAmount,
            outputPerMachine: n.outputPerMachine,
            machineName: n.machineName,
            category: n.category
        }));

        const links = sankeyData.links.map(l => ({
            source: l.source,
            target: l.target,
            value: l.value
        }));

        let bestResult: { individual: number[], fitness: number } | null = null;
        // let bestOptimizer: GeneticOptimizer | null = null; // To keep state if needed

        // Run multiple attempts
        for (let a = 0; a < attempts; a++) {
            const optimizer = new GeneticOptimizer(nodes, links, params);
            optimizer.initialize();
            for (let i = 0; i < params.generations; i++) {
                optimizer.evolve();
            }
            const res = optimizer.getBestResult();

            // We want the ONE with the best FITNESS (which includes transport penalty)
            // User asked for "least material transport", but if we ignore constraints (fitness), we might return a broken layout.
            // Since transport is part of fitness, minimizing fitness usually minimizes transport balanced with constraints.
            if (!bestResult || res.fitness < bestResult.fitness) {
                bestResult = res;
            }
        }

        if (!bestResult) throw new Error("Optimization failed");

        // 4. Construct Result from Best Individual
        const { individual } = bestResult;

        // Assign Cluster IDs
        nodes.forEach((n, i) => {
            n.clusterId = individual[i];
        });

        // Group into Cluster Map
        const clusters = new Map<number, MachineNode[]>();
        nodes.forEach(n => {
            if (n.clusterId !== undefined) {
                if (!clusters.has(n.clusterId)) clusters.set(n.clusterId, []);
                clusters.get(n.clusterId)!.push(n);
            }
        });

        // Calculate Stats
        let totalCrossFlow = 0;
        const nodeIndexMap = new Map(nodes.map((n, i) => [n.id, i]));
        for (const link of links) {
            const sIdx = nodeIndexMap.get(link.source as string);
            const tIdx = nodeIndexMap.get(link.target as string);
            if (sIdx !== undefined && tIdx !== undefined) {
                if (individual[sIdx] !== individual[tIdx]) {
                    totalCrossFlow += link.value;
                }
            }
        }

        resolve({
            nodes,
            links,
            clusters,
            stats: { totalCrossFlow }
        });
    });
};
