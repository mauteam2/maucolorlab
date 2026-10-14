import "server-only";

// Provider-neutral optional boundary. No live adapter, credentials, chemistry
// decision, write authority or commercial charging interpretation is configured.
export interface ReadonlyAiAnnotation { readonly text: string; readonly authoritative: false }
export interface AiGatewayPort {
  readonly configured: boolean;
  annotate(sourceIds: readonly string[]): Promise<ReadonlyAiAnnotation>;
}
export const disabledAiGateway: AiGatewayPort = {
  configured: false,
  async annotate() { throw new Error("AI_GATEWAY_UNCONFIGURED"); },
};
