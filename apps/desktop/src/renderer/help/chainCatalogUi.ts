import { CHAIN_CATALOG } from "./chain-catalog.generated";

export function chainNodeResourceBindingPolicy(
  nodeId: string
): "resource_bindable" | "builtin_only" {
  return CHAIN_CATALOG.nodes[nodeId]?.resourceBindingPolicy ?? "resource_bindable";
}

export function isResourceBindableChainNode(nodeId: string): boolean {
  return chainNodeResourceBindingPolicy(nodeId) === "resource_bindable";
}

export function chainNodeUiNotice(nodeId: string): string | undefined {
  return CHAIN_CATALOG.nodes[nodeId]?.uiNotice;
}

export function chainNodeUiTags(nodeId: string): string[] {
  return CHAIN_CATALOG.nodes[nodeId]?.uiTags ?? [];
}
