import type { DraftRequest, DraftingApi } from '../types';

/** `t` from src/lib/i18n, injected so this module loads without a bundler. */
export type Translate = (locale: string, key: string, vars?: Record<string, string | number>) => string;

export interface MockDraftingDeps {
  translate: Translate;
}

/**
 * A drafting adapter with no model behind it.
 *
 * It composes the reply out of `draft.template.*` locale keys, exactly the way
 * `email.plantilla` already does — so it is bilingual by construction and adds
 * no hardcoded copy, and so the text it produces is the same text a human would
 * have started from. It is deterministic and instant, which is why no `drafts`
 * collection exists yet: there is nothing worth persisting until a live model
 * makes a draft slow and expensive.
 */
export function createMockDrafting({ translate }: MockDraftingDeps): DraftingApi {
  return {
    live: false,
    async draft(i: DraftRequest) {
      const property = i.property ?? i.lead.expand?.propiedad;
      const tone = i.tone ?? 'default';

      const greeting = translate(
        i.locale,
        tone === 'formal' ? 'draft.template.greetingFormal' : 'draft.template.greeting',
        { name: i.lead.nombre },
      );
      const about = property
        ? translate(i.locale, 'draft.template.property', { title: property.titulo })
        : '';
      const body = translate(
        i.locale,
        tone === 'short' ? 'draft.template.bodyShort' : 'draft.template.body',
        { property: about },
      );

      const parts = [greeting, body];
      if (tone !== 'short') parts.push(translate(i.locale, 'draft.template.signoff'));

      return { text: parts.join('\n\n'), simulated: true };
    },
  };
}
