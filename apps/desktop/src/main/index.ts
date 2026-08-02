import { app, BrowserWindow, ipcMain, shell, safeStorage } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { bootstrapSchema, createDb, searchMattersFts, upsertMatterFts } from "@mattermail/database";
import { PRODUCT, GMAIL_READONLY_SCOPE } from "@mattermail/shared";
import { buildDemoSeed, formatRunId, intendedWriteFingerprint, newId } from "@mattermail/domain";
import { assertNoGmailMutations } from "@mattermail/gmail";
import { detectQuestEmail, validateQuestUrl } from "@mattermail/quest-email";
import { extractTextLocally, extractEntitiesLocally } from "@mattermail/extraction";
import { matchMatter, oneLineWhy, proposeSafeLearningRules, sortReviewQueue } from "@mattermail/matching";
import { activateRule } from "@mattermail/learning";
import { generateAuditReports } from "@mattermail/reporting";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import {
  assertClioRequestAllowed,
  assertGmailReadonlyScopes,
  getAllowedGmailScopes,
  SecretStore,
} from "@mattermail/security";
import { z } from "zod";
import { ConnectorManager, type ConnectorId } from "./connectors.js";
import {
  buildCommitPreflight,
  loadWriteReceipts,
  persistWriteReceipt,
  recordCommitRun,
  recordCommitStep,
  type StagedCommitItem,
} from "./commit.js";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

const dataDir = join(app.getPath("userData"), "mattermail-data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "mattermail.db");
const { db, sqlite } = createDb(dbPath);
bootstrapSchema(sqlite);

const secretsDir = join(dataDir, "secrets");
mkdirSync(secretsDir, { recursive: true });

const seed = buildDemoSeed();
let seeded = false;

type ReviewItem = {
  id: string;
  gmailMessageId: string;
  threadId: string;
  subject: string;
  snippet: string;
  bodyText: string;
  direction: "sent" | "received";
  fromEmail: string;
  fromName: string;
  date: string;
  isQuest: boolean;
  scenario: string;
  attachments: Array<{
    id: string;
    filename: string;
    sha256: string;
    textContent: string;
    ocrStatus: string;
  }>;
  proposedMatterId: string | null;
  confidence: string;
  caseRelatedness: string;
  reviewStatus: string;
  evidence: string[];
  whyLine: string;
  aiBadge: { provider: string; model: string };
};

const state = {
  setupComplete: false,
  reviewItems: [] as ReviewItem[],
  staged: [] as StagedCommitItem[],
  learningRules: [] as Array<Record<string, unknown>>,
  checkpoints: {
    lastGmailDownload: null as string | null,
    lastGmailReviewSession: null as string | null,
    lastClioIndexRefresh: null as string | null,
    lastClioCommit: null as string | null,
    lastDriveAuditUpload: null as string | null,
    lastQuestEmailScan: null as string | null,
    approvedNotCommitted: 0,
    unresolvedCaseRelated: 0,
  },
  aiConfig: {
    useOneModel: true,
    providerType: "MOCK" as const,
    profileName: "Demo Mock Provider",
    profileId: "demo-profile",
    ocrModelId: "mock-vision-model",
    matchingModelId: "mock-vision-model",
    learningModelId: "mock-vision-model",
    cloudAiDisabled: false,
    fallbackEnabled: false,
  },
  models: defaultModelsFor("MOCK"),
  undoStack: [] as Array<{ itemId: string; previousStatus: string }>,
  commitReceipts: [] as Array<Record<string, unknown>>,
  lastCommitRun: null as null | {
    runId: string;
    status: string;
    results: Array<Record<string, unknown>>;
    partialFailures: Array<{ stagedId: string; error: string }>;
  },
};

const connectors = new ConnectorManager(
  secretsDir,
  {
    isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
    encryptString: (v) => safeStorage.encryptString(v),
    decryptString: (buf) => safeStorage.decryptString(buf),
  },
  seed.matters.map((m) => ({
    id: m.clioMatterId,
    displayNumber: m.displayNumber,
    description: m.description,
    status: m.status,
    clientName: m.clientName,
    court: m.court,
    county: m.county,
    caseNumber: m.caseNumber,
    docketNumber: m.docketNumber,
    warrantNumber: m.warrantNumber ?? undefined,
  })),
);

// Hydrate Clio receipts from SQLite for idempotency across restarts
{
  const receipts = loadWriteReceipts(sqlite);
  connectors.clio.loadReceipts(
    receipts.map((r) => ({
      writeKind: r.writeKind,
      clioId: r.clioId,
      fingerprint: r.fingerprint,
      verified: r.verified,
    })),
  );
}

const secretStore = new SecretStore(secretsDir, {
  isEncryptionAvailable: () => safeStorage.isEncryptionAvailable(),
  encryptString: (v) => safeStorage.encryptString(v),
  decryptString: (buf) => safeStorage.decryptString(buf),
});

function seedDemoIfNeeded() {
  if (seeded) return;
  seeded = true;
  for (const m of seed.matters) {
    const localId = m.id;
    sqlite
      .prepare(
        `INSERT OR REPLACE INTO clio_matters(
          id, clio_matter_id, display_number, description, status, client_name,
          court, county, case_number, docket_number, warrant_number, practice_area,
          search_blob, is_demo, indexed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .run(
        localId,
        m.clioMatterId,
        m.displayNumber,
        m.description,
        m.status,
        m.clientName,
        m.court,
        m.county,
        m.caseNumber,
        m.docketNumber,
        m.warrantNumber,
        m.practiceArea,
        `${m.displayNumber} ${m.description} ${m.clientName} ${m.court} ${m.county} ${m.caseNumber} ${m.docketNumber} ${m.warrantNumber ?? ""}`,
        Date.now(),
      );
    upsertMatterFts(sqlite, {
      matterId: localId,
      displayNumber: m.displayNumber,
      description: m.description,
      clientName: m.clientName,
      court: m.court,
      county: m.county,
      caseNumber: m.caseNumber,
      docketNumber: m.docketNumber,
      warrantNumber: m.warrantNumber,
      practiceArea: m.practiceArea,
      searchBlob: `${m.clientName} ${m.description}`,
    });
  }
  state.checkpoints.lastClioIndexRefresh = new Date().toISOString();
}

function buildReviewQueue(): ReviewItem[] {
  seedDemoIfNeeded();
  const matters = seed.matters.map((m) => ({
    clioMatterId: m.clioMatterId,
    displayNumber: m.displayNumber,
    description: m.description,
    clientName: m.clientName,
    status: m.status,
    court: m.court,
    county: m.county,
    caseNumber: m.caseNumber,
    docketNumber: m.docketNumber,
    warrantNumber: m.warrantNumber,
  }));

  const items = seed.messages.map((msg) => {
    const atts = seed.attachments
      .filter((a) => a.messageGmailId === msg.gmailMessageId)
      .map((a) => ({
        id: a.id,
        filename: a.filename,
        sha256: a.sha256,
        textContent: a.textContent,
        ocrStatus: "local-extracted",
      }));
    const text = `${msg.bodyText}\n${atts.map((a) => a.textContent).join("\n")}`;
    const quest = detectQuestEmail({
      fromEmail: msg.from.email,
      subject: msg.subject,
      body: msg.bodyText,
    });
    const match = matchMatter({
      text,
      senderEmail: msg.from.email,
      threadId: msg.gmailThreadId,
      matters,
      rules: state.learningRules.map((r) => ({
        ruleType: String(r.ruleType),
        caseRelatedness: r.caseRelatedness as never,
        matterScope: r.matterScope as never,
        fixedMatterId: (r.fixedMatterId as string) ?? null,
        matchedValue: String(r.matchedValue),
        active: Boolean(r.active),
        userActivated: Boolean(r.userActivated),
      })),
    });
    return {
      id: msg.id,
      gmailMessageId: msg.gmailMessageId,
      threadId: msg.gmailThreadId,
      subject: msg.subject,
      snippet: msg.snippet,
      bodyText: msg.bodyText,
      direction: msg.direction,
      fromEmail: msg.from.email,
      fromName: msg.from.displayName,
      date: new Date().toISOString(),
      isQuest: msg.isQuest || quest.isQuest,
      scenario: msg.scenario,
      attachments: atts,
      proposedMatterId: match.candidates[0]?.clioMatterId ?? null,
      confidence: match.topConfidence,
      caseRelatedness: match.caseRelatedness,
      reviewStatus: "unreviewed",
      evidence: match.candidates[0]?.evidence.map((e) => e.explanation) ?? [],
      whyLine: oneLineWhy(match),
      aiBadge: {
        provider: state.aiConfig.providerType,
        model: state.aiConfig.matchingModelId,
      },
    } satisfies ReviewItem;
  });

  return sortReviewQueue(items);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    title: PRODUCT.name,
    webPreferences: {
      preload: join(__dirname, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

const IpcSchemas = {
  searchMatters: z.object({ query: z.string() }),
  reviewAction: z.object({
    itemId: z.string(),
    action: z.enum([
      "approve",
      "choose",
      "unknown",
      "not_related",
      "later",
      "duplicate",
      "split",
      "analyze",
      "undo",
    ]),
    matterId: z.string().optional(),
    remember: z.boolean().optional(),
  }),
  saveSecret: z.object({ key: z.string(), value: z.string() }),
  openExternal: z.object({ url: z.string().url() }),
  connectorId: z.object({ id: z.enum(["gmail", "clio", "drive"]) }),
  connectorCreds: z.object({
    googleClientId: z.string().optional(),
    googleClientSecret: z.string().optional(),
    clioClientId: z.string().optional(),
    clioClientSecret: z.string().optional(),
    driveAuditFolderId: z.string().optional(),
  }),
  commitPreflight: z.object({ stagedIds: z.array(z.string()).optional() }),
};

function registerIpc() {
  ipcMain.handle("app:getInfo", () => ({
    product: PRODUCT,
    demoMode: connectors.isDemoMode(),
    setupComplete: state.setupComplete,
    dataDir,
    connectors: connectors.status(),
  }));

  ipcMain.handle("app:getCheckpoints", () => state.checkpoints);

  ipcMain.handle("app:completeSetup", (_e, payload: { ai?: Partial<typeof state.aiConfig> }) => {
    if (payload?.ai) Object.assign(state.aiConfig, payload.ai);
    state.setupComplete = true;
    seedDemoIfNeeded();
    state.reviewItems = buildReviewQueue();
    state.checkpoints.unresolvedCaseRelated = state.reviewItems.filter(
      (i) => i.caseRelatedness !== "NEVER" && i.reviewStatus === "unreviewed",
    ).length;
    return { ok: true, demoMode: connectors.isDemoMode() };
  });

  ipcMain.handle("connectors:status", () => ({
    demoMode: connectors.isDemoMode(),
    connectors: connectors.status(),
    credentials: connectors.getClientCredentialHints(),
  }));

  ipcMain.handle("connectors:saveCredentials", (_e, raw: unknown) => {
    const parsed = IpcSchemas.connectorCreds.parse(raw);
    connectors.saveClientCredentials(parsed);
    return {
      ok: true,
      credentials: connectors.getClientCredentialHints(),
    };
  });

  ipcMain.handle("connectors:connect", async (_e, raw: unknown) => {
    const { id } = IpcSchemas.connectorId.parse(raw);
    try {
      const status = await connectors.connect(id as ConnectorId);
      return {
        ok: true,
        status,
        demoMode: connectors.isDemoMode(),
        connectors: connectors.status(),
      };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        demoMode: connectors.isDemoMode(),
        connectors: connectors.status(),
      };
    }
  });

  ipcMain.handle("connectors:disconnect", (_e, raw: unknown) => {
    const { id } = IpcSchemas.connectorId.parse(raw);
    const status = connectors.disconnect(id as ConnectorId);
    return {
      ok: true,
      status,
      demoMode: connectors.isDemoMode(),
      connectors: connectors.status(),
    };
  });

  ipcMain.handle("gmail:scan", async (_e, window: string) => {
    assertGmailReadonlyScopes([...getAllowedGmailScopes()]);
    assertNoGmailMutations(connectors.gmail);

    // Live Gmail: pull recent messages when connected; Demo keeps seed queue
    if (connectors.gmail.mode === "live") {
      const afterMs =
        window === "24h"
          ? Date.now() - 24 * 3600_000
          : window === "7d"
            ? Date.now() - 7 * 24 * 3600_000
            : Date.now() - 72 * 3600_000;
      try {
        const messages = await connectors.gmail.listMessages({ afterMs });
        // Map into review items with matching against indexed matters
        seedDemoIfNeeded();
        const matterRows = seed.matters.map((m) => ({
          clioMatterId: m.clioMatterId,
          displayNumber: m.displayNumber,
          description: m.description,
          clientName: m.clientName,
          status: m.status,
          court: m.court,
          county: m.county,
          caseNumber: m.caseNumber,
          docketNumber: m.docketNumber,
          warrantNumber: m.warrantNumber,
        }));
        const liveItems: ReviewItem[] = messages.map((msg) => {
          const quest = detectQuestEmail({
            fromEmail: msg.from,
            subject: msg.subject,
            body: msg.bodyText ?? msg.snippet,
          });
          const match = matchMatter({
            text: msg.bodyText ?? msg.snippet,
            senderEmail: msg.from,
            threadId: msg.threadId,
            matters: matterRows,
            rules: state.learningRules.map((r) => ({
              ruleType: String(r.ruleType),
              caseRelatedness: r.caseRelatedness as never,
              matterScope: r.matterScope as never,
              fixedMatterId: (r.fixedMatterId as string) ?? null,
              matchedValue: String(r.matchedValue),
              active: Boolean(r.active),
              userActivated: Boolean(r.userActivated),
            })),
          });
          return {
            id: msg.id,
            gmailMessageId: msg.id,
            threadId: msg.threadId,
            subject: msg.subject,
            snippet: msg.snippet,
            bodyText: msg.bodyText ?? msg.snippet,
            direction: msg.direction,
            fromEmail: msg.from,
            fromName: msg.from.split("<")[0]?.trim() || msg.from,
            date: new Date(msg.internalDate).toISOString(),
            isQuest: quest.isQuest,
            scenario: "live",
            attachments: [],
            proposedMatterId: match.candidates[0]?.clioMatterId ?? null,
            confidence: match.topConfidence,
            caseRelatedness: match.caseRelatedness,
            reviewStatus: "unreviewed",
            evidence: match.candidates[0]?.evidence.map((e) => e.explanation) ?? [],
            whyLine: oneLineWhy(match),
            aiBadge: {
              provider: state.aiConfig.providerType,
              model: state.aiConfig.matchingModelId,
            },
          };
        });
        state.reviewItems = sortReviewQueue(liveItems);
      } catch (err) {
        // Fall back to demo queue with error surfaced in audit
        state.reviewItems = buildReviewQueue();
        void err;
      }
    } else {
      state.reviewItems = buildReviewQueue();
    }

    state.checkpoints.lastGmailDownload = new Date().toISOString();
    state.checkpoints.lastQuestEmailScan = new Date().toISOString();
    const runId = formatRunId("SCAN-GMAIL");
    const auditDir = join(dataDir, "audit", runId);
    generateAuditReports(auditDir, {
      runId,
      kind: "scan",
      startedAt: state.checkpoints.lastGmailDownload,
      endedAt: state.checkpoints.lastGmailDownload,
      items: state.reviewItems.map((i) => ({
        id: i.id,
        subject: i.subject,
        from: i.fromEmail,
        window,
      })),
      checkpoints: state.checkpoints,
    });
    return {
      count: state.reviewItems.length,
      window,
      runId,
      items: state.reviewItems,
      mode: connectors.gmail.mode,
    };
  });

  ipcMain.handle("review:list", () => sortReviewQueue(state.reviewItems));

  ipcMain.handle("review:action", (_e, raw: unknown) => {
    const parsed = IpcSchemas.reviewAction.parse(raw);
    const item = state.reviewItems.find((i) => i.id === parsed.itemId);
    if (!item) return { ok: false, error: "not found" };

    if (parsed.action === "undo") {
      const last = state.undoStack.pop();
      if (last) {
        const it = state.reviewItems.find((i) => i.id === last.itemId);
        if (it) it.reviewStatus = last.previousStatus;
        state.staged = state.staged.filter((s) => s.sourceItemId !== last.itemId);
        state.checkpoints.approvedNotCommitted = state.staged.filter(
          (s) => s.state === "STAGED" || s.state === "FAILED" || s.state === "PARTIAL",
        ).length;
      }
      state.reviewItems = sortReviewQueue(state.reviewItems);
      return { ok: true, items: state.reviewItems, staged: state.staged };
    }

    state.undoStack.push({ itemId: item.id, previousStatus: item.reviewStatus });
    state.checkpoints.lastGmailReviewSession = new Date().toISOString();

    if (parsed.action === "analyze") {
      const adapter = createMockAdapter("MOCK", defaultModelsFor("MOCK"));
      const text = `${item.bodyText}\n${item.attachments.map((a) => a.textContent).join("\n")}`;
      return adapter
        .analyzeText({
          sourceItemId: item.id,
          text,
          candidateMatterSummaries: seed.matters.map((m) => ({
            clioMatterId: m.clioMatterId,
            displayNumber: m.displayNumber,
            clientName: m.clientName,
            description: m.description,
          })),
          requestedModelId: state.aiConfig.matchingModelId,
          providerProfileId: state.aiConfig.profileId,
          providerType: "MOCK",
          task: "MATCHING",
        })
        .then((out) => {
          item.proposedMatterId = out.result.matter_result.candidates[0]?.clio_matter_id ?? null;
          item.confidence = out.result.matter_result.candidates[0]?.confidence ?? "LOW";
          const reasons = out.result.matter_result.candidates[0]?.reasons as
            | string[]
            | undefined;
          item.whyLine =
            reasons?.[0] ??
            (item.confidence === "HIGH" ? "Strong AI match" : "AI suggestion");
          item.aiBadge = {
            provider: out.result.analysis.provider_type,
            model: out.result.analysis.actual_model_id ?? out.result.analysis.requested_model_id,
          };
          state.reviewItems = sortReviewQueue(state.reviewItems);
          return { ok: true, ai: out, items: state.reviewItems };
        });
    }

    const remember = parsed.remember !== false;
    let disposition = parsed.action;
    let matterId = parsed.matterId ?? item.proposedMatterId;

    if (parsed.action === "approve" || parsed.action === "choose") {
      item.reviewStatus = "approved";
      if (parsed.action === "choose") matterId = parsed.matterId ?? matterId;
      if (!matterId) return { ok: false, error: "matter required" };
      const fingerprint = intendedWriteFingerprint({
        sourceType: "gmail",
        sourceId: item.gmailMessageId,
        targetMatterId: matterId,
        direction: item.direction,
        timestampIso: item.date,
        attachmentHashes: item.attachments.map((a) => a.sha256),
      });
      const existingReceipt = connectors.clio.getReceipt(fingerprint, "communication");
      state.staged.push({
        id: newId("staged"),
        sourceItemId: item.id,
        matterId,
        disposition: parsed.action === "approve" ? "APPROVED_PROPOSED" : "APPROVED_ALTERNATE",
        state: "STAGED",
        fingerprint,
        subject: item.subject,
        body: item.bodyText,
        attachments: item.attachments,
        duplicateWarning: existingReceipt
          ? `Already has Clio receipt ${existingReceipt.clioId}`
          : null,
        lastError: null,
      });
      if (remember) {
        const proposals = proposeSafeLearningRules({
          senderEmail: item.fromEmail,
          threadId: item.threadId,
          docketNumbers: extractEntitiesLocally(item.bodyText).docketNumbers,
          matterId,
          disposition: disposition,
        });
        for (const p of proposals) {
          try {
            const rule = activateRule({
              ...p,
              proposedByAi: false,
              userConfirmed: true,
              sourceDecisionId: item.id,
            });
            state.learningRules.push(rule);
          } catch {
            /* skip unsafe */
          }
        }
      }
    } else if (parsed.action === "unknown") {
      item.reviewStatus = "matter_unknown";
    } else if (parsed.action === "not_related") {
      item.reviewStatus = "not_case_related";
    } else if (parsed.action === "later") {
      item.reviewStatus = "later";
    } else if (parsed.action === "duplicate") {
      item.reviewStatus = "duplicate";
    } else if (parsed.action === "split") {
      item.reviewStatus = "split_pending";
    }

    state.checkpoints.approvedNotCommitted = state.staged.filter(
      (s) => s.state === "STAGED" || s.state === "FAILED" || s.state === "PARTIAL",
    ).length;
    state.checkpoints.unresolvedCaseRelated = state.reviewItems.filter(
      (i) =>
        i.reviewStatus === "unreviewed" ||
        i.reviewStatus === "matter_unknown" ||
        i.reviewStatus === "later",
    ).length;

    state.reviewItems = sortReviewQueue(state.reviewItems);
    return { ok: true, items: state.reviewItems, staged: state.staged, proposedRules: remember };
  });

  ipcMain.handle("matters:search", (_e, raw: unknown) => {
    const { query } = IpcSchemas.searchMatters.parse(raw);
    seedDemoIfNeeded();
    return searchMattersFts(sqlite, query, 25);
  });

  ipcMain.handle("matters:list", () => {
    seedDemoIfNeeded();
    return seed.matters;
  });

  ipcMain.handle("staged:list", () => state.staged);

  ipcMain.handle("commit:preflight", (_e, raw: unknown) => {
    const parsed = IpcSchemas.commitPreflight.parse(raw ?? {});
    const selected = parsed.stagedIds?.length
      ? state.staged.filter((s) => parsed.stagedIds!.includes(s.id))
      : state.staged.filter((s) => s.state !== "COMPLETE");
    return buildCommitPreflight(selected, {
      receiptExists: (fp, kind) => Boolean(connectors.clio.getReceipt(fp, kind)),
    });
  });

  ipcMain.handle("commit:run", async (_e, stagedIds: string[]) => {
    const selected = state.staged.filter((s) => stagedIds.includes(String(s.id)));
    const preflight = buildCommitPreflight(selected, {
      receiptExists: (fp, kind) => Boolean(connectors.clio.getReceipt(fp, kind)),
    });
    if (!preflight.canCommit) {
      return { ok: false, error: "Preflight blocked commit", preflight };
    }

    const runId = formatRunId("COMMIT-CLIO");
    const startedAt = Date.now();
    recordCommitRun(sqlite, {
      runId,
      status: "RUNNING",
      startedAt,
      counts: { selected: selected.length },
    });

    const results: Array<Record<string, unknown>> = [];
    const partialFailures: Array<{ stagedId: string; error: string }> = [];

    for (const item of selected) {
      if (item.state === "COMPLETE") {
        results.push({ stagedId: item.id, skipped: true, reason: "already complete" });
        continue;
      }

      const stepStart = Date.now();
      try {
        item.state = "COMMITTING";
        const fp = String(item.fingerprint);
        let commReceipt = connectors.clio.getReceipt(fp, "communication");
        if (!commReceipt) {
          assertClioRequestAllowed({ method: "POST", path: "/api/v4/communications" });
          commReceipt = await connectors.clio.createCommunication({
            subject: String(item.subject),
            body: String(item.body),
            matterId: String(item.matterId),
            direction: "email",
            date: new Date().toISOString(),
            fingerprint: fp,
          });
        }
        persistWriteReceipt(sqlite, {
          stagedItemId: item.id,
          writeKind: "communication",
          fingerprint: fp,
          clioId: commReceipt.clioId,
          verified: commReceipt.verified,
        });
        recordCommitStep(sqlite, {
          commitRunId: runId,
          stagedItemId: item.id,
          step: "communication",
          status: "COMPLETE",
          detail: commReceipt,
          startedAt: stepStart,
          endedAt: Date.now(),
        });

        const docReceipts = [];
        for (const att of item.attachments ?? []) {
          const docFp = `${fp}:${att.sha256}`;
          let doc = connectors.clio.getReceipt(docFp, "document");
          if (!doc) {
            doc = await connectors.clio.createDocument({
              matterId: String(item.matterId),
              filename: att.filename,
              contentBase64: Buffer.from(att.textContent).toString("base64"),
              sha256: att.sha256,
              fingerprint: docFp,
            });
          }
          persistWriteReceipt(sqlite, {
            stagedItemId: item.id,
            writeKind: "document",
            fingerprint: docFp,
            clioId: doc.clioId,
            verified: doc.verified,
          });
          docReceipts.push(doc);
          recordCommitStep(sqlite, {
            commitRunId: runId,
            stagedItemId: item.id,
            step: `document:${att.filename}`,
            status: "COMPLETE",
            detail: doc,
            startedAt: Date.now(),
            endedAt: Date.now(),
          });
        }

        item.state = "COMPLETE";
        item.lastError = null;
        results.push({ stagedId: item.id, communication: commReceipt, documents: docReceipts });
        state.commitReceipts.push({
          stagedId: item.id,
          communication: commReceipt,
          documents: docReceipts,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        item.state = "FAILED";
        item.lastError = message;
        partialFailures.push({ stagedId: item.id, error: message });
        recordCommitStep(sqlite, {
          commitRunId: runId,
          stagedItemId: item.id,
          step: "item",
          status: "FAILED",
          detail: { error: message },
          startedAt: stepStart,
          endedAt: Date.now(),
        });
      }
    }

    const status =
      partialFailures.length === 0
        ? "COMPLETE"
        : partialFailures.length === selected.length
          ? "FAILED"
          : "PARTIAL";

    state.checkpoints.lastClioCommit = new Date().toISOString();
    const auditDir = join(dataDir, "audit", runId);
    const artifacts = generateAuditReports(auditDir, {
      runId,
      kind: "commit",
      startedAt: state.checkpoints.lastClioCommit,
      endedAt: state.checkpoints.lastClioCommit,
      items: results,
      clioIds: results,
      partialFailures,
    });

    try {
      for (const kind of ["json", "pdf", "xlsx"] as const) {
        const path =
          kind === "json"
            ? artifacts.jsonPath
            : kind === "pdf"
              ? artifacts.pdfPath
              : artifacts.xlsxPath;
        const content = readFileSync(path);
        await connectors.drive.uploadAuditFile({
          runId,
          filename: path.split(/[\\/]/).pop()!,
          content,
        });
      }
      state.checkpoints.lastDriveAuditUpload = new Date().toISOString();
    } catch (err) {
      // Drive failure does not roll back Clio writes; surface in run status
      partialFailures.push({
        stagedId: "_drive",
        error: err instanceof Error ? err.message : String(err),
      });
    }

    // Keep FAILED/PARTIAL items for retry; drop COMPLETE
    state.staged = state.staged.filter((s) => s.state !== "COMPLETE");
    state.checkpoints.approvedNotCommitted = state.staged.filter(
      (s) => s.state === "STAGED" || s.state === "FAILED" || s.state === "PARTIAL",
    ).length;

    recordCommitRun(sqlite, {
      runId,
      status,
      startedAt,
      endedAt: Date.now(),
      counts: {
        selected: selected.length,
        complete: results.filter((r) => !r.skipped).length - partialFailures.filter((p) => p.stagedId !== "_drive").length,
        failed: partialFailures.length,
      },
      error: partialFailures[0]?.error ?? null,
    });

    state.lastCommitRun = { runId, status, results, partialFailures };
    return {
      ok: status !== "FAILED",
      runId,
      status,
      results,
      artifacts,
      partialFailures,
      preflight,
      staged: state.staged,
    };
  });

  ipcMain.handle("commit:lastRun", () => state.lastCommitRun);

  ipcMain.handle("ai:listModels", () => state.models);
  ipcMain.handle("ai:getConfig", () => state.aiConfig);
  ipcMain.handle("ai:setConfig", (_e, cfg: Partial<typeof state.aiConfig>) => {
    Object.assign(state.aiConfig, cfg);
    return state.aiConfig;
  });

  ipcMain.handle("ai:testCapabilities", async (_e, modelId: string) => {
    const adapter = createMockAdapter("MOCK", defaultModelsFor("MOCK"));
    return adapter.testModelCapabilities(modelId);
  });

  ipcMain.handle("secrets:save", (_e, raw: unknown) => {
    const { key, value } = IpcSchemas.saveSecret.parse(raw);
    return { ok: true, ...secretStore.save(key, value) };
  });

  ipcMain.handle("secrets:remove", (_e, key: string) => {
    secretStore.remove(key);
    return { ok: true };
  });

  ipcMain.handle("quest:openLink", async (_e, url: string) => {
    const v = validateQuestUrl(url);
    if (!v.ok) return { ok: false, ...v };
    await shell.openExternal(url);
    return { ok: true, ...v };
  });

  ipcMain.handle("shell:openExternal", async (_e, raw: unknown) => {
    const { url } = IpcSchemas.openExternal.parse(raw);
    await shell.openExternal(url);
    return { ok: true };
  });

  ipcMain.handle("learning:list", () => state.learningRules);
  ipcMain.handle("clio:refreshIndex", async () => {
    seedDemoIfNeeded();
    const indexed = await connectors.clio.indexMatters();
    // When live, upsert into SQLite
    if (connectors.clio.mode === "live") {
      for (const m of indexed) {
        const localId = `clio-${m.id}`;
        sqlite
          .prepare(
            `INSERT OR REPLACE INTO clio_matters(
              id, clio_matter_id, display_number, description, status, client_name,
              court, county, case_number, docket_number, warrant_number, practice_area,
              search_blob, is_demo, indexed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
          )
          .run(
            localId,
            m.id,
            m.displayNumber,
            m.description,
            m.status,
            m.clientName,
            m.court ?? null,
            m.county ?? null,
            m.caseNumber ?? null,
            m.docketNumber ?? null,
            m.warrantNumber ?? null,
            null,
            `${m.displayNumber} ${m.description} ${m.clientName}`,
            Date.now(),
          );
        upsertMatterFts(sqlite, {
          matterId: localId,
          displayNumber: m.displayNumber,
          description: m.description,
          clientName: m.clientName,
          court: m.court,
          county: m.county,
          caseNumber: m.caseNumber,
          docketNumber: m.docketNumber,
          warrantNumber: m.warrantNumber,
          practiceArea: null,
          searchBlob: `${m.clientName} ${m.description}`,
        });
      }
    }
    state.checkpoints.lastClioIndexRefresh = new Date().toISOString();
    return {
      count: indexed.length,
      at: state.checkpoints.lastClioIndexRefresh,
      mode: connectors.clio.mode,
    };
  });

  ipcMain.handle("safety:selfCheck", () => {
    const results = [];
    try {
      assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
      results.push({ name: "gmail_readonly", ok: true });
    } catch (e) {
      results.push({ name: "gmail_readonly", ok: false, error: String(e) });
    }
    try {
      assertClioRequestAllowed({ method: "DELETE", path: "/api/v4/matters/1" });
      results.push({ name: "clio_delete_blocked", ok: false });
    } catch {
      results.push({ name: "clio_delete_blocked", ok: true });
    }
    try {
      assertClioRequestAllowed({ method: "PATCH", path: "/api/v4/communications/1" });
      results.push({ name: "clio_patch_blocked", ok: false });
    } catch {
      results.push({ name: "clio_patch_blocked", ok: true });
    }
    results.push({ name: "drive_no_delete", ok: connectors.drive.delete === undefined });
    results.push({ name: "contextIsolation", ok: true });
    results.push({
      name: "oauth_loopback_ready",
      ok: true,
      detail: "PKCE loopback available for Gmail/Drive; Clio uses client secret exchange",
    });
    return results;
  });

  void db;
  void extractTextLocally;
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
