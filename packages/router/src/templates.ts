import type { RoutingMode } from "./rules.js";

export interface ExecutionTemplateNode {
  id: string;
  role:
    "executor" | "contract_compiler" | "planner" | "branch" | "synthesizer" | "verifier" | "repair";
  durable: boolean;
}

export interface ExecutionTemplate {
  id: string;
  mode: RoutingMode;
  nodes: ExecutionTemplateNode[];
  edges: Array<{ from: string; to: string }>;
  limits: { maxRounds: number; maxBranches: number };
}

const templates: Record<RoutingMode, ExecutionTemplate> = {
  DIRECT: {
    id: "direct/v1",
    mode: "DIRECT",
    nodes: [
      { id: "executor", role: "executor", durable: false },
      { id: "deterministic-verifier", role: "verifier", durable: false }
    ],
    edges: [{ from: "executor", to: "deterministic-verifier" }],
    limits: { maxRounds: 1, maxBranches: 1 }
  },
  CONTRACT: {
    id: "contract/v1",
    mode: "CONTRACT",
    nodes: [
      { id: "contract-compiler", role: "contract_compiler", durable: true },
      { id: "coherent-executor", role: "executor", durable: true },
      { id: "independent-verifier", role: "verifier", durable: true },
      { id: "bounded-repair", role: "repair", durable: true }
    ],
    edges: [
      { from: "contract-compiler", to: "coherent-executor" },
      { from: "coherent-executor", to: "independent-verifier" },
      { from: "independent-verifier", to: "bounded-repair" },
      { from: "bounded-repair", to: "independent-verifier" }
    ],
    limits: { maxRounds: 3, maxBranches: 1 }
  },
  EXPLORER: {
    id: "explorer/v1",
    mode: "EXPLORER",
    nodes: [
      { id: "versioned-planner", role: "planner", durable: true },
      { id: "independent-branches", role: "branch", durable: true },
      { id: "evidence-synthesis", role: "synthesizer", durable: true },
      { id: "adversarial-verifier", role: "verifier", durable: true }
    ],
    edges: [
      { from: "versioned-planner", to: "independent-branches" },
      { from: "independent-branches", to: "evidence-synthesis" },
      { from: "evidence-synthesis", to: "adversarial-verifier" }
    ],
    limits: { maxRounds: 4, maxBranches: 8 }
  }
};

export function templateForMode(mode: RoutingMode): ExecutionTemplate {
  return structuredClone(templates[mode]);
}
