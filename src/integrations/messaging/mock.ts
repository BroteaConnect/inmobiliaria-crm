import type { MessagingApi, OutboundMessage, SendReceipt } from '../types';

/**
 * Writes the simulated send down. Injected rather than imported so this module
 * has no runtime dependency on PocketBase — which is what makes it testable
 * with `node --test`, and what stops a mock from quietly becoming a second
 * data layer.
 */
export type SimulatedSendRecorder = (m: OutboundMessage & { receipt: SendReceipt }) => Promise<unknown>;

export interface MockMessagingDeps {
  record?: SimulatedSendRecorder;
  now?: () => Date;
  newId?: () => string;
}

/**
 * A messaging adapter that sends nothing.
 *
 * Every receipt it hands back carries `simulated: true`, and the activity it
 * records is written with `estado_envio: 'simulado'` by the recorder the
 * registry wires in. Both matter: a simulated send that shows the agent a
 * delivered tick teaches her to trust a message that never left, and the
 * digest job in the sibling repo counts `entregado|abierto|click` — a mock
 * borrowing `enviado` would end up in a report as real activity.
 *
 * If recording fails the send fails. A receipt returned after the activity was
 * lost is a success message for something that did not happen.
 */
export function createMockMessaging(deps: MockMessagingDeps = {}): MessagingApi {
  const now = deps.now ?? (() => new Date());
  const newId = deps.newId ?? (() => `sim_${Math.random().toString(36).slice(2, 10)}`);

  return {
    live: false,
    async send(m: OutboundMessage): Promise<SendReceipt> {
      const receipt: SendReceipt = {
        messageId: newId(),
        queuedAt: now().toISOString(),
        simulated: true,
      };
      if (deps.record) await deps.record({ ...m, receipt });
      return receipt;
    },
  };
}
