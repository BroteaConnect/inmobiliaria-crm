// users.ts — who can a lead or a visit be assigned to.
//
// The `users` list/view rule opens to signed-in users with a landing PR that
// is not yet applied everywhere; until it is, listing users either answers
// only the caller (a rule of `id = @request.auth.id`) or refuses outright
// (403, or 400 when the rule is unset). Neither may take a screen down: the
// worst acceptable answer is "just you". PURE so `node --test` can prove the
// fallback without a server.
import type { Usuario } from '../crm/api';

/** What `currentUser()` knows about the signed-in agent. */
export interface SelfLike { id: string; email?: string; name?: string }

/** The signed-in agent as a `users` row, or nobody (a break-glass session). */
export const selfAsUsuario = (me: SelfLike | null | undefined): Usuario[] =>
  (me?.id ? [{ id: me.id, email: me.email, name: me.name }] : []);

/**
 * Every user the server will show, or the caller alone when it will not.
 * Never throws: a directory that cannot be read is a directory of one.
 */
export async function listUsersOrSelf(
  read: () => Promise<Usuario[]>,
  self: () => SelfLike | null | undefined,
): Promise<Usuario[]> {
  try {
    return await read();
  } catch {
    return selfAsUsuario(self());
  }
}
