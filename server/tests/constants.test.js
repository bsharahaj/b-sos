import { describe, it, expect } from 'vitest';
import { SOS_TYPES, SKILLS, TYPE_TO_SKILLS } from '../../shared/constants.js';

describe('shared constants', () => {
  it('maps every SOS type to at least one known skill', () => {
    for (const type of Object.values(SOS_TYPES)) {
      expect(TYPE_TO_SKILLS[type].length).toBeGreaterThan(0);
      for (const skill of TYPE_TO_SKILLS[type]) expect(Object.values(SKILLS)).toContain(skill);
    }
  });
});
