# Star Rupture Optimizer

A high-performance base layout and production planner for the game **Star Rupture**.

This tool helps players optimize their factory logistics by calculating exact production requirements and generating efficient base layouts using advanced clustering algorithms.

## 🚀 Features

### 🏭 Production Planning (Sankey Chart)
*   **Precise Calculations**: Input your target production rates (e.g., "12 Superconductors/min") and get an exact breakdown of all required raw materials and intermediate machines.
*   **Visual Flow**: Interactive **Sankey Diagram** showing the flow of materials from ore to final product.

### 🧩 Base Layout Optimization
Stop guessing where to build. The optimizer uses two distinct algorithms to group your machines into efficient "Bases":

1.  **K-Means Clustering**:
    *   Fast, geometric clustering based on a physics simulation.
    *   Great for quickly finding balanced groups of machines.

2.  **Genetic Algorithm (Evolutionary Solver)**:
    *   Simulates thousands of generations to "evolve" the perfect layout.
    *   **Multi-Objective**: Optimizes for minimal transport distance, co-location rules, and balanced base sizes.
    *   **Smart Constraints**: Respects "Split Location" rules (e.g., separating Water from Lava) and "Co-Location" rules (e.g., keeping Smelters near Miners).

### 📊 Advanced Logistics Stats
*   **Logistics Matrix**: See exactly which base sends what items to whom.
*   **Transport Volume**: Real-time stats on total cross-border item transport.
*   **Import/Export Lists**: Detailed per-base breakdown of resource inflows and outflows.

## 🛠️ Usage

1.  **Select Targets**: Choose what you want to produce from the sidebar (defaults to item's max output rate).
2.  **Configure Settings**:
    *   Set the number of **Target Bases**.
    *   Adjust **Constraints** (e.g., "Keep Titanium Ore & Bar together").
3.  **Run Optimizer**:
    *   Use **K-Means** for a quick result.
    *   Use **Genetic Algorithm** (with high try count) for a high-quality, finalized plan.
4.  **Analyze**: Use the visual map to build your in-game bases accordingly.

## 🔧 Technology Stack

*   **Frontend**: React, TypeScript, Vite
*   **Visualization**: D3.js (Sankey), React Flow (Node Graph)
*   **Algorithms**: Custom K-Means & Genetic Algorithm implementations

## 📦 Deployment

This is a static web application. It can be easily deployed to **Vercel**, **Netlify**, or **GitHub Pages**.
See `DEPLOY.md` for detailed instructions.

## 📄 License

MIT License - free to use and modify.
