import { STATUSES } from '../../../shared/constants.js';
import { prisma } from '../config/prisma.js';
import { HttpError } from '../utils/httpError.js';

// Single source of truth for the SOS state machine (CLAUDE.md §4):
// OPEN -> ACCEPTED -> EN_ROUTE -> ARRIVED -> RESOLVED, or CANCELLED from any non-final state.
export const TRANSITIONS = Object.freeze({
  [STATUSES.OPEN]: [STATUSES.ACCEPTED, STATUSES.CANCELLED],
  [STATUSES.ACCEPTED]: [STATUSES.EN_ROUTE, STATUSES.CANCELLED],
  [STATUSES.EN_ROUTE]: [STATUSES.ARRIVED, STATUSES.CANCELLED],
  [STATUSES.ARRIVED]: [STATUSES.RESOLVED, STATUSES.CANCELLED],
  [STATUSES.RESOLVED]: [],
  [STATUSES.CANCELLED]: [],
});

export function canTransition(from, to) {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// Who may cancel, and from which statuses. Once the helper has arrived, cancelling makes no sense: resolve instead.
export const REQUESTER_CANCELLABLE = Object.freeze([STATUSES.OPEN, STATUSES.ACCEPTED]);
export const HELPER_CANCELLABLE = Object.freeze([STATUSES.ACCEPTED, STATUSES.EN_ROUTE]);

const NOT_CANCELLABLE_MESSAGE = {
  [STATUSES.RESOLVED]: 'This SOS is already resolved.',
  [STATUSES.CANCELLED]: 'This SOS was already cancelled.',
  [STATUSES.ARRIVED]: 'Your helper has already arrived. Mark the SOS as resolved instead.',
  [STATUSES.EN_ROUTE]: 'Your helper is already on the way. Please wait for them to arrive.',
};

export async function cancelSos(sosId, userId, reason) {
  const sos = await prisma.sosRequest.findUnique({
    where: { id: sosId },
    select: { id: true, status: true, requesterId: true, helperId: true },
  });
  if (!sos) throw new HttpError(404, 'SOS_NOT_FOUND', 'This SOS does not exist.');

  const isRequester = sos.requesterId === userId;
  const isHelper = sos.helperId === userId;
  if (!isRequester && !isHelper) throw new HttpError(403, 'NOT_YOUR_SOS', 'Only the requester or the assigned helper can cancel this SOS.');

  const allowedFrom = isRequester ? REQUESTER_CANCELLABLE : HELPER_CANCELLABLE;
  if (!allowedFrom.includes(sos.status)) {
    throw new HttpError(409, 'SOS_NOT_CANCELLABLE', NOT_CANCELLABLE_MESSAGE[sos.status] ?? 'This SOS can no longer be cancelled.');
  }

  // Conditional update: if the status changed between our read and this write (e.g. a helper accepted
  // at the same moment), nothing is updated and we report the conflict instead of clobbering it.
  const { count } = await prisma.sosRequest.updateMany({
    where: { id: sosId, status: { in: allowedFrom } },
    data: { status: STATUSES.CANCELLED, cancelledAt: new Date(), cancelledBy: userId, cancelReason: reason ?? null },
  });
  if (count === 0) throw new HttpError(409, 'SOS_NOT_CANCELLABLE', 'This SOS just changed. Please check its status.');

  return { cancelledBy: isRequester ? 'REQUESTER' : 'HELPER' };
}
