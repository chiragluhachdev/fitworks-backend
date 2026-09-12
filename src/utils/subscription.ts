/** Trainer activation: a single ₹99 payment, no renewal. */
export const ACTIVATION_AMOUNT_PAISE = 9900;
export const ACTIVATION_PLAN = "trainer_activation_99";

export interface ActivationState {
  status: "inactive" | "active";
  isActive: boolean;
  /** When the one-time payment landed. Null until they pay. */
  activatedAt: Date | null;
  /** Total rupees received from this trainer. */
  totalPaid: number;
  /** Payments on record. More than one only from a legacy monthly renewal. */
  paymentsMade: number;
}

/**
 * When this trainer paid, or null if they never did.
 *
 * Records created before the switch to one-time billing have no activatedAt,
 * only a monthly period and a payment history. Anyone who ever paid stays
 * active permanently — a change in our pricing model must not revoke access
 * somebody already bought.
 */
const paidAt = (sub: any): Date | null => {
  if (sub?.activatedAt) return new Date(sub.activatedAt);
  const first = (sub?.history || [])[0];
  if (first?.paidAt) return new Date(first.paidAt);
  if (sub?.currentPeriodStart) return new Date(sub.currentPeriodStart);
  return null;
};

/**
 * Derives activation status from the payment record.
 *
 * There is no expiry to compute any more: paid is paid, permanently.
 */
export const getActivationState = (sub: any): ActivationState => {
  const at = paidAt(sub);
  const history = sub?.history || [];

  return {
    status: at ? "active" : "inactive",
    isActive: Boolean(at),
    activatedAt: at,
    totalPaid: history.reduce((sum: number, h: any) => sum + (h.amount || 0), 0),
    paymentsMade: history.length || sub?.cyclesPaid || 0,
  };
};

/**
 * Mongo filter fragment for "this trainer has paid".
 *
 * A missing field compares equal to null in Mongo, so $ne: null correctly
 * excludes trainers who never paid. The history clause catches records from
 * the monthly era that predate activatedAt.
 */
export const activatedTrainerFilter = () => ({
  $or: [
    { "subscription.activatedAt": { $ne: null } },
    { "subscription.history.0": { $exists: true } },
  ],
});

export type AccessBlockReason = "pending_review" | "rejected" | "not_activated" | null;

export interface JobAccess {
  allowed: boolean;
  reason: AccessBlockReason;
  title: string;
  message: string;
  /** Whether the one-time payment is already on record. */
  isActivated: boolean;
}

/**
 * Whether a trainer may browse and apply to gym vacancies.
 *
 * Paying the one-time ₹99 is the gate. Awaiting verification does not hold a
 * trainer back: an unreviewed profile is the default state of every signup, and
 * making paying customers wait on our review queue costs them the thing they
 * just bought. Verification is a trust badge gyms see on an application, not a
 * turnstile.
 *
 * An explicit rejection still blocks, because that is a deliberate decision
 * about a specific profile rather than a queue we haven't got to yet.
 */
export const getJobAccess = (trainer: any): JobAccess => {
  const status = trainer?.verificationStatus;
  const state = getActivationState(trainer?.subscription);
  const context = { isActivated: state.isActive };

  if (status === "rejected") {
    return {
      allowed: false,
      reason: "rejected",
      title: "Your profile needs attention",
      message:
        "We couldn't verify the documents you submitted. Re-upload a valid certificate and a clear government ID to get approved.",
      ...context,
    };
  }

  if (!state.isActive) {
    return {
      allowed: false,
      reason: "not_activated",
      title: "Activate your profile",
      message:
        "FitWorks charges trainers a one-time ₹99 to activate. Pay once and you can browse every gym vacancy and apply to as many as you like — the gym sees your full profile with each application. No monthly fee, nothing more to pay later.",
      ...context,
    };
  }

  return { allowed: true, reason: null, title: "", message: "", ...context };
};
