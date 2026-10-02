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
  /** video ad: imageUrl is the cover frame */
  isVideo?: boolean;
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

/** Everything the assistant must know about one advertiser (one ad account). */
export interface Company {
  accountId: string;
  name: string;
  industry: string;
  services: { name: string; price?: string }[];
  phone: string;
  area: string;
  website: string;
  /** why choose them: guarantees, speed, reviews… */
  usp: string;
  brandVoice: string;
  /** overrides the global target cost per lead */
  targetCpl?: number;
  /** Facebook Page that runs the ads and owns the lead forms */
  pageId?: string;
  logoUrl?: string;
  colors: [string, string];
  notes: string;
  updatedAt: string;
}

export interface KnowledgeEntry {
  id: string;
  title: string;
  body: string;
  source?: string;
  tags: string[];
  /** own = the user's experience (wins over the playbook) */
  kind: "own" | "playbook";
  createdAt: string;
}

export interface MetaPage {
  id: string;
  name: string;
  /** page access token (needed for lead forms, leads, webhook subscription) */
  token: string;
  leadgenSubscribed?: boolean;
}

export interface MetaAuth {
  userId: string;
  userName: string;
  /** long-lived user access token */
  token: string;
  expiresAt?: string;
  scopes: string[];
  pages: MetaPage[];
  connectedAt: string;
}

export interface MediaItem {
  id: string;
  /** served by OCP: /api/media/<file> */
  url: string;
  file: string;
  kind: "upload" | "generated" | "composed";
  prompt?: string;
  accountId?: string;
  createdAt: string;
}

export type AutopilotLevel = "ask" | "bounded" | "full";

export interface Settings {
  currency: string;
  /** default target cost per lead (a company can override it) */
  targetCpl: number;
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

/** Pushed from the server to every open browser over /api/live (SSE). */
export type LiveEvent =
  | { type: "invalidate"; keys: LiveKey[] }
  | { type: "lead"; lead: Lead; accountName?: string }
  | { type: "hello"; at: string };

export type LiveKey = "ads" | "leads" | "activity" | "proposals" | "accounts" | "company" | "knowledge" | "recipes" | "health";

export interface ChatTurnEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  tool?: string;
  label?: string;
  ok?: boolean;
}
