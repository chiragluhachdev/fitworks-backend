/**
 * FitWorks is free for trainers. Nothing here gates access any more.
 *
 * The payment code and these constants are kept because a group of trainers
 * did pay ₹99 under the old model and that history has to stay readable — and
 * so charging can be switched back on without rebuilding it.
 */
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

export type AccessBlockReason = "pending_review" | "rejected" | null;

export interface JobAccess {
  allowed: boolean;
  reason: AccessBlockReason;
  title: string;
  message: string;
}

/**
 * Whether a trainer may browse and apply to gym vacancies.
 *
 * Verification is the gate, and it is free: an approved profile is active, and
 * everything before approval is not. Gyms only ever receive applications from
 * trainers whose documents we have actually checked.
 */
export const getJobAccess = (trainer: any): JobAccess => {
  const status = trainer?.verificationStatus;

  if (status === "pending") {
    return {
      allowed: false,
      reason: "pending_review",
      title: "Your profile is under review",
      message:
        "Our team is checking the documents you uploaded. Once approved, your profile goes active and every gym vacancy unlocks here — usually within 24 hours.",
    };
  }

  if (status === "rejected") {
    return {
      allowed: false,
      reason: "rejected",
      title: "Your profile needs attention",
      message:
        "We couldn't verify the documents you submitted. Re-upload a valid certificate and a clear government ID to get approved.",
    };
  }

  return { allowed: true, reason: null, title: "", message: "" };
};
