// The ports every external service reaches this CRM through.
//
// Nothing outside this directory talks to an external service. A screen asks
// the registry for the port it needs, gets back whichever adapter the settings
// say, and never learns which one it got — except that it MUST show when the
// answer was simulated, which is why `simulated` is on the receipt and not an
// implementation detail of the mock.
import type { Lead, Propiedad } from '../crm/api';

export type AdapterKind = 'mock' | 'live';

export interface Port<Api> {
  /** stable English id, also the settings key suffix (`integrations.<id>`) */
  id: string;
  /** i18n key, never a literal */
  labelKey: string;
  /** null = not built yet */
  adapters: Record<AdapterKind, () => Api | null>;
}

export interface SendReceipt {
  messageId: string;
  queuedAt: string;
  /** the mock MUST set true; the UI MUST show it */
  simulated: boolean;
}

export interface OutboundMessage {
  leadId: string;
  channel: 'whatsapp' | 'email';
  body: string;
  subject?: string;
}

export interface MessagingApi {
  readonly live: boolean;
  send(m: OutboundMessage): Promise<SendReceipt>;
}

export interface DraftRequest {
  lead: Lead;
  property?: Propiedad;
  locale: string;
  tone?: 'default' | 'formal' | 'short';
}

export interface DraftingApi {
  readonly live: boolean;
  draft(i: DraftRequest): Promise<{ text: string; simulated: boolean }>;
}
