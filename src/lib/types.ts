export type AdStatus = "ACTIVE" | "PAUSED";

export interface AdAccount {
  id: string;
  name: string;
  currency: string;
}

export interface AdMetrics {
  /** Last 7 days, account currency */
  spend: number;
  impressions: number;
  reach: number;
  frequency: number;
  clicks: number;
  ctr: number; // %
  cpm: number;
  leads: number;
  /** cost per lead, null when there are no leads yet */
  cpl: number | null;
}

/** One day of delivery for one ad. `date` is YYYY-MM-DD. */
export interface DailyPoint {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export interface Creative {
  headline: string;
  primaryText: string;
  cta: string;
  imageUrl?: string;
  /** used to render a branded preview when there is no image */
  palette?: [string, string];
  /** recipe the creative was built from */
  recipeId?: string;
}

export type LearningStatus = "LEARNING" | "SUCCESS" | "FAIL";

export interface Ad {
  id: string;
  accountId: string;
  name: string;
  status: AdStatus;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adsetDailyBudget: number;
  adsetLearning?: LearningStatus;
  creative: Creative;
  /** last 7 days summary (used by the monitor) */
  metrics: AdMetrics;
  /** daily delivery, oldest first (up to 90 days) */
  daily: DailyPoint[];
  createdAt: string;
}

export type ProposalKind =
  | "pause_ad"
  | "activate_ad"
  | "scale_budget"
  | "reduce_budget"
  | "refresh_creative"
  | "info";

export type ProposalStatus = "pending" | "approved" | "rejected" | "executed" | "failed";

export interface ProposalAction {
  type: "set_status" | "set_budget" | "none";
  adId?: string;
  adsetId?: string;
  status?: AdStatus;
  dailyBudget?: number;
}

export interface Proposal {
  id: string;
  accountId?: string;
  /** dedupe key so the monitor doesn't raise the same thing twice */
  key: string;
  kind: ProposalKind;
  severity: "high" | "medium" | "low";
  title: string;
  reason: string;
  impact?: string;
  adId?: string;
  action: ProposalAction;
  status: ProposalStatus;
  createdAt: string;
  resolvedAt?: string;
  result?: string;
}

export type ActivityActor = "agent" | "user" | "system";

export interface Activity {
  id: string;
  ts: string;
  actor: ActivityActor;
  kind: "scan" | "action" | "proposal" | "chat" | "create" | "error" | "lead";
  text: string;
}

export type LeadStatus = "new" | "contacted" | "survey" | "won" | "lost";

export interface Lead {
  id: string;
  accountId?: string;
  createdAt: string;
  adId?: string;
  formName: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  note?: string;
  status: LeadStatus;
}

/** A proven ad format that can be reused for other offers/clients. */
export interface Recipe {
  id: string;
  name: string;
  description: string;
  /** must stay exactly like this */
  fixed: string[];
  /** must be filled in for the new offer */
  required: string[];
  /** free to change */
  free: string[];
  textTemplate: string;
  exampleAdId?: string;
  palette: [string, string];
  createdAt: string;
}

export type AutopilotLevel = "ask" | "bounded" | "full";

export interface Settings {
  currency: string;
  /** target cost per lead */
  targetCpl: number;
  brandVoice: string;
  autopilot: {
    /**
     * ask: everything waits for approval
     * bounded: pause zero-result spenders + scale winners within maxBudgetIncreasePct on its own
     * full: every actionable proposal is executed on its own
     */
    level: AutopilotLevel;
    /** pause when spend >= targetCpl * this multiplier and 0 leads */
    autoPauseSpendMultiplier: number;
    /** max % budget raise in one step */
    maxBudgetIncreasePct: number;
    /** frequency over which creative refresh is proposed */
    frequencyLimit: number;
  };
}

export interface ChatTurnEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  tool?: string;
  label?: string;
  ok?: boolean;
}
