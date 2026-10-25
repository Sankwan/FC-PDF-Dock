import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_CODE, DEMO_EMAIL, matchesDemoCredentials, readDemoSession, writeDemoSession } from '../client/src/lib/demoAccess';

test('public demo accepts only its displayed pair and normalizes the email', () => {
  assert.equal(matchesDemoCredentials(` ${DEMO_EMAIL.toUpperCase()} `, DEMO_CODE), true);
  assert.equal(matchesDemoCredentials('staff.person@fc.gov.gh', DEMO_CODE), false);
  assert.equal(matchesDemoCredentials(DEMO_EMAIL, '000000'), false);
  assert.equal(matchesDemoCredentials('', ''), false);
});

test('demo session cannot restore when the pilot flag is disabled and is cleared on exit', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
  try {
    assert.equal(readDemoSession(true), false);
    writeDemoSession(true);
    assert.equal(readDemoSession(true), true);
    assert.equal(readDemoSession(false), false);
    assert.equal(readDemoSession(true), false);
    writeDemoSession(true);
    writeDemoSession(false);
    assert.equal(readDemoSession(true), false);
    assert.equal([...values.keys()].some(key => key === 'pdfdock.staff'), false);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'sessionStorage', previous);
    else Reflect.deleteProperty(globalThis, 'sessionStorage');
  }
});
