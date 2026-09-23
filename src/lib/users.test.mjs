import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listUsersOrSelf, selfAsUsuario } from './users';

const ME = { id: 'u_me', email: 'me@agency.test', name: 'Me', role: 'admin' };
const ALL = [{ id: 'u_a', name: 'Ana' }, { id: 'u_me', name: 'Me' }];

test('when the rule is open, the directory is what the server says', async () => {
  const users = await listUsersOrSelf(async () => ALL, () => ME);
  assert.deepEqual(users, ALL);
});

test('a 403 (rule still closed) degrades to the caller alone, never a throw', async () => {
  const users = await listUsersOrSelf(
    async () => { throw new Error('pb 403: {"message":"Only superusers can perform this action."}'); },
    () => ME,
  );
  assert.deepEqual(users, [{ id: 'u_me', email: 'me@agency.test', name: 'Me' }]);
});

test('a 400 (rule unset) degrades the same way', async () => {
  const users = await listUsersOrSelf(async () => { throw new Error('pb 400: bad request'); }, () => ME);
  assert.equal(users.length, 1);
  assert.equal(users[0].id, 'u_me');
});

test('a break-glass session has no user: the directory is empty, still no throw', async () => {
  const users = await listUsersOrSelf(async () => { throw new Error('pb 403'); }, () => null);
  assert.deepEqual(users, []);
});

test('the fallback row carries only what a users row carries', () => {
  assert.deepEqual(selfAsUsuario(ME), [{ id: 'u_me', email: 'me@agency.test', name: 'Me' }]);
  assert.deepEqual(selfAsUsuario(null), []);
  assert.deepEqual(selfAsUsuario({ id: '' }), [], 'an empty id is nobody');
});
