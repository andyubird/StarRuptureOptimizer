import type { Buildings, Recipe } from '../types';

export interface SankeyNode {
    name: string;
    category?: string;
    machineName?: string;
    outputPerMachine?: number;
    requiredAmount?: number;
}

export interface SankeyLink {
    source: string;
    target: string;
    value: number;
}

export interface SankeyData {
    nodes: SankeyNode[];
    links: SankeyLink[];
}

export const calculateRequirements = (
    buildings: Buildings,
    targets: { id: string; amount: number }[]
): SankeyData => {
    const nodes = new Map<string, SankeyNode>();
    const links: SankeyLink[] = [];
    const linksMap = new Map<string, number>();

    const findRecipe = (itemId: string): { recipe: Recipe; buildingId: string; buildingName: string } | null => {
        for (const building of buildings) {
            if (building.recipes) {
                for (const recipe of building.recipes) {
                    if (recipe.output.id === itemId) {
                        return { recipe, buildingId: building.id, buildingName: building.name };
                    }
                }
            }
        }
        return null;
    };

    const traverse = (itemId: string, amount: number) => {
        // We determine the producer logic here to assign category
        const result = findRecipe(itemId);

        let node = nodes.get(itemId);
        if (!node) {
            node = {
                name: itemId,
                category: result ? result.buildingId : 'raw',
                machineName: result ? result.buildingName : 'Source',
                outputPerMachine: result ? result.recipe.output.amount_per_minute : undefined,
                requiredAmount: 0
            };
            nodes.set(itemId, node);
        }

        // Accumulate requirement
        if (node.requiredAmount !== undefined) {
            node.requiredAmount += amount;
        }

        if (!result) return; // Raw material

        const { recipe } = result;
        const ratio = amount / recipe.output.amount_per_minute;

        recipe.inputs.forEach(input => {
            const inputAmount = input.amount_per_minute * ratio;
            const linkKey = `${input.id}|${itemId}`;
            linksMap.set(linkKey, (linksMap.get(linkKey) || 0) + inputAmount);

            traverse(input.id, inputAmount);
        });
    };

    // Initialize with all targets
    targets.forEach(t => traverse(t.id, t.amount));

    linksMap.forEach((value, key) => {
        const [source, target] = key.split('|');
        // Ensure nodes exist (they should, but just in case of raw inputs not traversed as targets)
        // Raw inputs are traversed as arguments to `traverse`, so they are added to nodes.
        links.push({ source, target, value });
    });

    return {
        nodes: Array.from(nodes.values()),
        links
    };
};
