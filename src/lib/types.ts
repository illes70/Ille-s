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
  /** Meta creative id (images are cached under /api/creative/<id>) */
  creativeId?: string;
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
  kind: "scan" | "action" | "proposal" | "chat" | "create" | "error" | "lead" | "brief" | "guard";
  text: string;
  /** how to take this change back with one click (status/budget changes) */
  undo?: UndoAction;
  undoneAt?: string;
}

/** Restores the state before a change: the previous status or budget of an object. */
export type UndoAction =
  | { type: "status"; level: "ad" | "adset" | "campaign"; id: string; accountId: string; status: AdStatus }
  | { type: "budget"; level: "adset" | "campaign"; id: string; accountId: string; dailyBudget: number }
  /** several ads at once (e.g. what the spend cap paused) */
  | { type: "statuses"; accountId: string; items: { level: "ad" | "adset" | "campaign"; id: string; status: AdStatus }[] };

/** The morning brief: what happened, and what to do today. */
export interface Brief {
  id: string;
  /** local date it was written for (YYYY-MM-DD) */
  date: string;
  createdAt: string;
  /** "Jó reggelt, …!" + short summary (AI-written when Claude is available) */
  text: string;
  totals: { yesterday: PeriodTotals; last7: PeriodTotals; newLeads: number };
  todo: { text: string; proposalId?: string; accountId?: string; severity: "high" | "medium" | "low" }[];
  readAt?: string;
}

/** Browser push subscription (Web Push API) of one device. */
export interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  userId: string;
  label?: string;
  createdAt: string;
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
  /** spam / duplicate check done on arrival */
  quality?: { verdict: "ok" | "suspect" | "spam"; flags: string[]; duplicateOf?: string };
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
  /** hard daily spend cap of the ad account: over it OCP pauses every active campaign */
  dailySpendCap?: number;
  /** Facebook Page that runs the ads and owns the lead forms */
  pageId?: string;
  /** Instagram business account the ads run with */
  instagramUserId?: string;
  instagramUsername?: string;
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

export interface User {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: "owner" | "member";
  /** workspace this person works in (default: their own id) */
  tenantId?: string;
  createdAt: string;
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
  /** background schedule (0-24 engine) */
  schedule?: {
    /** monitor scan of every account, minutes (0 = off) */
    scanEveryMinutes: number;
    briefEnabled: boolean;
    /** local "HH:MM" */
    briefTime: string;
    timezone: string;
  };
  /** where OCP reaches you */
  notify?: {
    email?: string;
    leadsEmail: boolean;
    leadsPush: boolean;
    briefEmail: boolean;
    briefPush: boolean;
    alertsEmail: boolean;
    alertsPush: boolean;
  };
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

export interface PeriodTotals {
  spend: number;
  leads: number;
  clicks: number;
  impressions: number;
}

/** Headline numbers of one ad account (overview of all accounts). */
export interface AccountSummary {
  accountId: string;
  today: PeriodTotals;
  yesterday?: PeriodTotals;
  last7: PeriodTotals;
  activeAds: number;
  error?: string;
}

export interface SyncState {
  running: boolean;
  done: number;
  total: number;
  current?: string;
}

/** Pushed from the server to every open browser over /api/live (SSE). */
export type LiveEvent =
  | { type: "invalidate"; keys: LiveKey[] }
  | { type: "lead"; lead: Lead; accountName?: string }
  | { type: "sync"; sync: SyncState }
  | { type: "account"; account: AdAccount }
  | { type: "hello"; at: string };

export type LiveKey = "ads" | "leads" | "activity" | "proposals" | "accounts" | "company" | "knowledge" | "recipes" | "health" | "overview" | "brief" | "settings";

export interface ChatTurnEvent {
  type: "text" | "tool_start" | "tool_end" | "error" | "done";
  text?: string;
  tool?: string;
  label?: string;
  ok?: boolean;
  /** the advisor stopped the action: waiting for the user / not allowed */
  flag?: "confirm" | "refused";
}
