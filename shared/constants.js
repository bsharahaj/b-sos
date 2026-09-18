// Single source of truth for domain enums, shared by client and server.
// Changing any value here affects both sides — ask before editing (CLAUDE.md §10).

const enumOf = (...values) => Object.freeze(Object.fromEntries(values.map((v) => [v, v])));

export const SOS_TYPES = enumOf('MEDICAL', 'VEHICLE', 'TRANSPORT', 'SAFETY', 'OTHER');

export const SKILLS = enumOf('MEDICAL', 'MECHANIC', 'DRIVER', 'GENERAL');

export const STATUSES = enumOf('OPEN', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'RESOLVED', 'CANCELLED');

export const VERIFICATION = enumOf('NONE', 'PENDING', 'VERIFIED', 'REJECTED');

// Which helper skills can respond to each SOS type.
export const TYPE_TO_SKILLS = Object.freeze({
  [SOS_TYPES.MEDICAL]: Object.freeze([SKILLS.MEDICAL, SKILLS.GENERAL]),
  [SOS_TYPES.VEHICLE]: Object.freeze([SKILLS.MECHANIC, SKILLS.DRIVER, SKILLS.GENERAL]),
  [SOS_TYPES.TRANSPORT]: Object.freeze([SKILLS.DRIVER, SKILLS.GENERAL]),
  [SOS_TYPES.SAFETY]: Object.freeze([SKILLS.GENERAL]),
  [SOS_TYPES.OTHER]: Object.freeze([SKILLS.GENERAL]),
});

// Matching radius per escalation round (round 1 = initial search).
export const RADII = Object.freeze({ 1: 3, 2: 5, 3: 10 }); // km
