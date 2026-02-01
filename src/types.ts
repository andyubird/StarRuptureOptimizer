export interface ItemRate {
    id: string;
    amount_per_minute: number;
}

export interface Recipe {
    output: ItemRate;
    inputs: ItemRate[];
}

export interface Building {
    id: string;
    name: string;
    type: 'production' | 'generator' | 'transport' | 'habitat' | 'temperature' | 'defense';
    power?: number;
    heat?: number;
    recipes?: Recipe[];
}

export type Buildings = Building[];

// Graph / Simulation Types
export interface MachineNode {
    // Basic Node Data
    id: string; // Unique ID e.g. "smelter_1"
    name: string; // "Smelter"
    // Simulation / Layout Data
    x?: number;
    y?: number;
    vx?: number;
    vy?: number;
    fx?: number | null;
    fy?: number | null;
    index?: number;
    // Game Data
    buildingId?: string; // "smelter"
    recipeOutputId?: string; // What it makes
    clusterId?: number;
    requiredAmount?: number;
    outputPerMachine?: number;
    machineName?: string;
    category?: string;
}

export interface MachineLink {
    source: string | MachineNode; // d3-force replaces string with Node object
    target: string | MachineNode;
    value: number; // Items per minute
    index?: number;
}

export interface OptimizerResult {
    nodes: MachineNode[];
    links: MachineLink[];
    clusters: Map<number, MachineNode[]>;
    stats?: {
        totalCrossFlow: number;
    }
}
