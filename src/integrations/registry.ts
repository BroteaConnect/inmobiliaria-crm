// Which ports exist, and what is behind each of them today.
//
// A port is declared here even when nothing implements it. That is the point:
// Configuration can list "Campaigns — not available yet" instead of the app
// pretending the idea does not exist, and the day someone builds it the screen
// already knows where to put it.
import { registrarContacto } from '../crm/api';
import { t } from '../lib/i18n';
import { createMockDrafting } from './drafting/mock';
import { createMockMessaging, type SimulatedSendRecorder } from './messaging/mock';
import type { DraftingApi, MessagingApi, Port } from './types';

/**
 * The one place a simulated send touches the database. `estado_envio:
 * 'simulado'` is deliberate and load-bearing: the digest job in the sibling
 * repo counts `entregado|abierto|click`, so a simulation can never be added up
 * as delivered mail.
 */
const recordSimulatedSend: SimulatedSendRecorder = (m) =>
  registrarContacto(m.leadId, m.channel === 'whatsapp' ? 'whatsapp' : 'email', m.body, {
    asunto: m.subject,
    estado_envio: 'simulado',
    mensaje_id: m.receipt.messageId,
  });

export const messagingPort: Port<MessagingApi> = {
  id: 'messaging',
  labelKey: 'integration.messaging',
  adapters: {
    mock: () => createMockMessaging({ record: recordSimulatedSend }),
    // The WhatsApp Business API needs an account, a reviewed template and
    // number-health telemetry. None of that is a UI decision.
    live: () => null,
  },
};

export const draftingPort: Port<DraftingApi> = {
  id: 'drafting',
  labelKey: 'integration.drafting',
  adapters: {
    mock: () => createMockDrafting({ translate: t }),
    // A real model belongs to the feature that pays for its latency and cost.
    live: () => null,
  },
};

/** Declared, deliberately empty — see the deferral table in the analysis. */
const emptyPort = (id: string): Port<unknown> => ({
  id,
  labelKey: `integration.${id}`,
  adapters: { mock: () => null, live: () => null },
});

export const campaignsPort = emptyPort('campaigns');
export const reportsPort = emptyPort('reports');
export const mapsPort = emptyPort('maps');

/** Every port, in the order Configuration lists them. */
export const PORTS: Port<unknown>[] = [
  messagingPort,
  draftingPort,
  campaignsPort,
  reportsPort,
  mapsPort,
];

/** The settings key that holds a port's chosen adapter. */
export const settingKeyOf = (port: Pick<Port<unknown>, 'id'>) => `integrations.${port.id}`;
