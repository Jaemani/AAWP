export interface RuntimePort {
  readonly name: string;
  runDeterministicNode(nodeId: string, inputs: Record<string, unknown>): Promise<Record<string, unknown>>;
}
