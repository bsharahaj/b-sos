import { describe, it, expect } from 'vitest';
import { STATUSES } from '../../../shared/constants.js';
import { TRANSITIONS, canTransition, REQUESTER_CANCELLABLE, HELPER_CANCELLABLE } from '../../src/services/sosLifecycle.js';

describe('SOS lifecycle table', () => {
  it('covers every status exactly once', () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(Object.values(STATUSES).sort());
  });

  it('follows OPEN -> ACCEPTED -> EN_ROUTE -> ARRIVED -> RESOLVED', () => {
    expect(canTransition('OPEN', 'ACCEPTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'EN_ROUTE')).toBe(true);
    expect(canTransition('EN_ROUTE', 'ARRIVED')).toBe(true);
    expect(canTransition('ARRIVED', 'RESOLVED')).toBe(true);
  });

  it('never skips a step or goes backwards', () => {
    expect(canTransition('OPEN', 'EN_ROUTE')).toBe(false);
    expect(canTransition('OPEN', 'RESOLVED')).toBe(false);
    expect(canTransition('ACCEPTED', 'OPEN')).toBe(false);
    expect(canTransition('ARRIVED', 'EN_ROUTE')).toBe(false);
  });

  it('allows CANCELLED from every non-final status and nothing out of final ones', () => {
    for (const from of ['OPEN', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED']) expect(canTransition(from, 'CANCELLED')).toBe(true);
    expect(TRANSITIONS.RESOLVED).toEqual([]);
    expect(TRANSITIONS.CANCELLED).toEqual([]);
    expect(canTransition('BOGUS', 'CANCELLED')).toBe(false);
  });

  it('lets the requester cancel while OPEN/ACCEPTED and the helper while ACCEPTED/EN_ROUTE', () => {
    expect(REQUESTER_CANCELLABLE).toEqual(['OPEN', 'ACCEPTED']);
    expect(HELPER_CANCELLABLE).toEqual(['ACCEPTED', 'EN_ROUTE']);
  });
});
