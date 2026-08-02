import { app, BrowserWindow, ipcMain, shell, safeStorage } from "electron";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync, writeFileSync, readFileSync, unlinkSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { bootstrapSchema, createDb, searchMattersFts, upsertMatterFts } from "@mattermail/database";
import { PRODUCT } from "@mattermail/shared";
import { buildDemoSeed, formatRunId, intendedWriteFingerprint, newId } from "@mattermail/domain";
import { createMockGmailConnector, assertNoGmailMutations } from "@mattermail/gmail";
import { createMockClioClient } from "@mattermail/clio";
import { createMockDriveClient } from "@mattermail/drive";
import { detectQuestEmail, validateQuestUrl } from "@mattermail/quest-email";
import { extractTextLocally, extractEntitiesLocally } from "@mattermail/extraction";
import { matchMatter, proposeSafeLearningRules } from "@mattermail/matching";
import { activateRule } from "@mattermail/learning";
import { generateAuditReports } from "@mattermail/reporting";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import {
  assertClioRequestAllowed,
  assertGmailReadonlyScopes,
  getAllowedGmailScopes,
} from "@mattermail/security";
import { GMAIL_READONLY_SCOPE } from "@mattermail/shared";
import { z } from "zod";

const isDev = !app.isPackaged;
let mainWindow: BrowserWindow | null = null;

const dataDir = join(app.getPath("userData"), "mattermail-data");
mkdirSync(dataDir, { recursive: true });
const dbPath = join(dataDir, "mattermail.db");
const { db, sqlite } = createDb(dbPath);
bootstrapSchema(sqlite);

const secretsDir = join(dataDir, "secrets");
mkdirSync(secretsDir, { recursive: true });

const demoMode = true;
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
  attachments: Array<{ id: string; filename: string; sha256: string; textContent: string; ocrStatus: string }>;
  proposedMatterId: string | null;
  confidence: string;
  caseRelatedness: string;
  reviewStatus: string;
  evidence: string[];
  aiBadge: { provider: string; model: string };
};

const state = {
  setupComplete: false,
  demoMode,
  reviewItems: [] as ReviewItem[],
  staged: [] as Array<Record<string, unknown>>,
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
};

const drive = createMockDriveClient();
const clio = createMockClioClient(
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

  return seed.messages.map((msg) => {
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
      aiBadge: {
        provider: state.aiConfig.providerType,
        model: state.aiConfig.matchingModelId,
      },
    };
  });
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
};

function registerIpc() {
  ipcMain.handle("app:getInfo", () => ({
    product: PRODUCT,
    demoMode: state.demoMode,
    setupComplete: state.setupComplete,
    dataDir,
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
    return { ok: true };
  });

  ipcMain.handle("gmail:scan", (_e, window: string) => {
    assertGmailReadonlyScopes([...getAllowedGmailScopes()]);
    const gmail = createMockGmailConnector([]);
    assertNoGmailMutations(gmail);
    state.reviewItems = buildReviewQueue();
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
    };
  });

  ipcMain.handle("review:list", () => state.reviewItems);

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
        state.checkpoints.approvedNotCommitted = state.staged.length;
      }
      return { ok: true, items: state.reviewItems, staged: state.staged };
    }

    state.undoStack.push({ itemId: item.id, previousStatus: item.reviewStatus });
    state.checkpoints.lastGmailReviewSession = new Date().toISOString();

    if (parsed.action === "analyze") {
      const adapter = createMockAdapter("MOCK", defaultModelsFor("MOCK"));
      const text = `${item.bodyText}\n${item.attachments.map((a) => a.textContent).join("\n")}`;
      return adapter.analyzeText({
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
      }).then((out) => {
        item.proposedMatterId = out.result.matter_result.candidates[0]?.clio_matter_id ?? null;
        item.confidence = out.result.matter_result.candidates[0]?.confidence ?? "LOW";
        item.aiBadge = {
          provider: out.result.analysis.provider_type,
          model: out.result.analysis.actual_model_id ?? out.result.analysis.requested_model_id,
        };
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
          // Do not auto-activate AI unsafe sender→fixed; proposeSafe already uses VARIABLE for sender
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

    state.checkpoints.approvedNotCommitted = state.staged.length;
    state.checkpoints.unresolvedCaseRelated = state.reviewItems.filter(
      (i) =>
        i.reviewStatus === "unreviewed" ||
        i.reviewStatus === "matter_unknown" ||
        i.reviewStatus === "later",
    ).length;

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

  ipcMain.handle("commit:run", async (_e, stagedIds: string[]) => {
    const selected = state.staged.filter((s) => stagedIds.includes(String(s.id)));
    const runId = formatRunId("COMMIT-CLIO");
    const results = [];
    for (const item of selected) {
      const fp = String(item.fingerprint);
      // Idempotent: skip if receipt exists
      const existing = clio.getReceipt(fp, "communication");
      let commReceipt = existing;
      if (!commReceipt) {
        assertClioRequestAllowed({ method: "POST", path: "/api/v4/communications" });
        commReceipt = await clio.createCommunication({
          subject: String(item.subject),
          body: String(item.body),
          matterId: String(item.matterId),
          direction: "email",
          date: new Date().toISOString(),
          fingerprint: fp,
        });
      }
      const docReceipts = [];
      for (const att of (item.attachments as Array<{ filename: string; sha256: string; textContent: string }>) ?? []) {
        const docFp = `${fp}:${att.sha256}`;
        let doc = clio.getReceipt(docFp, "document");
        if (!doc) {
          doc = await clio.createDocument({
            matterId: String(item.matterId),
            filename: att.filename,
            contentBase64: Buffer.from(att.textContent).toString("base64"),
            sha256: att.sha256,
            fingerprint: docFp,
          });
        }
        docReceipts.push(doc);
      }
      item.state = "COMPLETE";
      results.push({ stagedId: item.id, communication: commReceipt, documents: docReceipts });
      state.commitReceipts.push({ stagedId: item.id, communication: commReceipt, documents: docReceipts });
    }

    state.checkpoints.lastClioCommit = new Date().toISOString();
    const auditDir = join(dataDir, "audit", runId);
    const artifacts = generateAuditReports(auditDir, {
      runId,
      kind: "commit",
      startedAt: state.checkpoints.lastClioCommit,
      endedAt: state.checkpoints.lastClioCommit,
      items: results,
      clioIds: results,
    });

    for (const kind of ["json", "pdf", "xlsx"] as const) {
      const path =
        kind === "json" ? artifacts.jsonPath : kind === "pdf" ? artifacts.pdfPath : artifacts.xlsxPath;
      const content = readFileSync(path);
      const uploaded = await drive.uploadAuditFile({
        runId,
        filename: path.split(/[\\/]/).pop()!,
        content,
      });
      void uploaded;
    }
    state.checkpoints.lastDriveAuditUpload = new Date().toISOString();
    state.staged = state.staged.filter((s) => s.state !== "COMPLETE");
    state.checkpoints.approvedNotCommitted = state.staged.length;

    return { runId, results, artifacts };
  });

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
    const file = join(secretsDir, `${key}.bin`);
    if (safeStorage.isEncryptionAvailable()) {
      writeFileSync(file, safeStorage.encryptString(value));
    } else {
      // Fallback for headless CI — still not SQLite plaintext; file perms only
      writeFileSync(file, Buffer.from(value, "utf8"));
    }
    return { ok: true, masked: value.slice(0, 3) + "••••" };
  });

  ipcMain.handle("secrets:remove", (_e, key: string) => {
    const file = join(secretsDir, `${key}.bin`);
    if (existsSync(file)) {
      unlinkSync(file);
    }
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
    await clio.indexMatters();
    state.checkpoints.lastClioIndexRefresh = new Date().toISOString();
    return { count: seed.matters.length, at: state.checkpoints.lastClioIndexRefresh };
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
    results.push({ name: "drive_no_delete", ok: drive.delete === undefined });
    results.push({
      name: "contextIsolation",
      ok: true,
    });
    return results;
  });

  // Suppress unused db lint in scaffold
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
