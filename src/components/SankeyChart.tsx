import React, { useMemo, useEffect, useRef } from 'react';
import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
import * as d3 from 'd3-selection';
import { zoom } from 'd3-zoom';
import type { SankeyData } from '../utils/calculations';

interface SankeyChartProps {
    data: SankeyData;
    width: number;
    height: number;
}

const categoryColors: Record<string, string> = {
    smelter: '#E69F00',
    furnace: '#D55E00',
    fabricator: '#56B4E9',
    refinery: '#009E73',
    mega_press: '#CC79A7',
    assembler: '#0072B2',
    compounder: '#F0E442',
    ore_excavator: '#888888',
    helium_extractor: '#888888',
    sulfur_extractor: '#888888',
    raw: '#cccccc',
    default: '#333333'
};

export const SankeyChart: React.FC<SankeyChartProps> = ({ data, width, height }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const gRef = useRef<SVGGElement>(null);

    const { nodes, links } = useMemo(() => {
        const generator = sankey<any, any>()
            .nodeWidth(15)
            .nodePadding(10)
            .extent([[1, 1], [width - 1, height - 6]])
            .nodeId((d: any) => d.name);

        // Deep clone to safely allow d3 mutation
        const nodesCopy = data.nodes.map(d => ({ ...d }));
        const linksCopy = data.links.map(d => ({ ...d }));

        return generator({
            nodes: nodesCopy,
            links: linksCopy
        });
    }, [data, width, height]);

    // Zoom Logic
    useEffect(() => {
        if (!svgRef.current || !gRef.current) return;

        const svg = d3.select(svgRef.current);
        const g = d3.select(gRef.current);

        const zoomBehavior = zoom()
            .scaleExtent([0.1, 8])
            .on('zoom', (event) => {
                g.attr('transform', event.transform);
            });

        // Type casting for d3 integration
        svg.call(zoomBehavior as any);

        // Initial Center (optional reset)
        // svg.call(zoomBehavior.transform as any, zoomIdentity);

    }, [width, height, nodes, links]);

    const getColor = (node: any) => {
        return categoryColors[node.category || 'default'] || categoryColors.default;
    };

    return (
        <svg ref={svgRef} width={width} height={height} style={{ overflow: 'hidden', border: '1px solid #333' }}>
            <g ref={gRef}>
                {links.map((link: any, i: number) => (
                    <path
                        key={i}
                        d={sankeyLinkHorizontal()(link) || undefined}
                        stroke="#999"
                        strokeOpacity={0.5}
                        strokeWidth={Math.max(1, link.width || 1)}
                        fill="none"
                    >
                        <title>{`${link.source.name} → ${link.target.name}\n${(link.value || 0).toFixed(1)} / min`}</title>
                    </path>
                ))}
                {nodes.map((node: any, i: number) => {
                    // Use requiredAmount if available (for exact production), otherwise fall back to value (d3 calculated)
                    const demand = node.requiredAmount !== undefined ? node.requiredAmount : (node.value || 0);

                    const machineCount = node.outputPerMachine
                        ? (demand / node.outputPerMachine).toFixed(1)
                        : '';
                    const labelLines = [
                        `${node.name}`,
                        `(${Math.round(demand)}/min)`
                    ];
                    if (node.machineName && node.machineName !== 'Source' && node.machineName !== 'sink') {
                        labelLines.push(`${node.machineName} * ${machineCount}`);
                    }

                    return (
                        <g key={i}>
                            <rect
                                x={node.x0}
                                y={node.y0}
                                width={(node.x1 || 0) - (node.x0 || 0)}
                                height={(node.y1 || 0) - (node.y0 || 0)}
                                fill={getColor(node)}
                                stroke="#000"
                            >
                                <title>{`${node.name}\n${demand.toFixed(1)} / min`}</title>
                            </rect>
                            <text
                                x={(node.x0 || 0) - 6}
                                y={((node.y0 || 0) + (node.y1 || 0)) / 2}
                                dy="-0.5em"
                                textAnchor="end"
                                fontSize="10px"
                                fill="#fff"
                            >
                                {labelLines.map((line, idx) => (
                                    <tspan x={(node.x0 || 0) - 6} dy={idx === 0 ? 0 : "1.1em"} key={idx}>
                                        {line}
                                    </tspan>
                                ))}
                            </text>
                        </g>
                    );
                })}
            </g>
        </svg>
    );
};
