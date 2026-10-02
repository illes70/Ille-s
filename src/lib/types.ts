export type AdStatus = "ACTIVE" | "PAUSED";

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

export interface Creative {
  headline: string;
  primaryText: string;
  cta: string;
  imageUrl?: string;
  /** used to render a branded preview when there is no image */
  palette?: [string, string];
}

export interface Ad {
  id: string;
  name: string;
  status: AdStatus;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adsetDailyBudget: number;
  creative: Creative;
  metrics: AdMetrics;
  /** daily spend for the last 7 days, oldest first */
  spendTrend: number[];
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
  kind: "scan" | "action" | "proposal" | "chat" | "create" | "error";
  text: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  adId?: string;
  formName: string;
  name: string;
  phone?: string;
  email?: string;
  city?: string;
  note?: string;
}

export interface Settings {
  currency: string;
  /** target cost per lead */
  targetCpl: number;
  brandVoice: string;
  autopilot: {
    /** pause ads automatically (without asking) when they burn budget with no result */
    autoPause: boolean;
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
