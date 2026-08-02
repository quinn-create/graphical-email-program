import { contextBridge, ipcRenderer } from "electron";
import { z } from "zod";

const allowedChannels = [
  "app:getInfo",
  "app:getCheckpoints",
  "app:completeSetup",
  "gmail:scan",
  "review:list",
  "review:action",
  "matters:search",
  "matters:list",
  "staged:list",
  "commit:run",
  "commit:preflight",
  "commit:lastRun",
  "ai:listModels",
  "ai:getConfig",
  "ai:setConfig",
  "ai:testCapabilities",
  "secrets:save",
  "secrets:remove",
  "quest:openLink",
  "shell:openExternal",
  "learning:list",
  "clio:refreshIndex",
  "safety:selfCheck",
  "connectors:status",
  "connectors:saveCredentials",
  "connectors:connect",
  "connectors:disconnect",
] as const;

type Channel = (typeof allowedChannels)[number];

function invoke<T>(channel: Channel, ...args: unknown[]): Promise<T> {
  if (!(allowedChannels as readonly string[]).includes(channel)) {
    return Promise.reject(new Error(`IPC channel not allowed: ${channel}`));
  }
  return ipcRenderer.invoke(channel, ...args) as Promise<T>;
}

const api = {
  getInfo: () => invoke<Record<string, unknown>>("app:getInfo"),
  getCheckpoints: () => invoke<Record<string, unknown>>("app:getCheckpoints"),
  completeSetup: (payload?: Record<string, unknown>) =>
    invoke("app:completeSetup", payload),
  scanGmail: (window: string) => invoke("gmail:scan", window),
  listReview: () => invoke<unknown[]>("review:list"),
  reviewAction: (payload: Record<string, unknown>) =>
    invoke("review:action", payload),
  searchMatters: (query: string) => invoke("matters:search", { query }),
  listMatters: () => invoke("matters:list"),
  listStaged: () => invoke("staged:list"),
  commit: (stagedIds: string[]) => invoke("commit:run", stagedIds),
  commitPreflight: (stagedIds?: string[]) =>
    invoke("commit:preflight", { stagedIds }),
  lastCommitRun: () => invoke("commit:lastRun"),
  listModels: () => invoke("ai:listModels"),
  getAiConfig: () => invoke("ai:getConfig"),
  setAiConfig: (cfg: Record<string, unknown>) => invoke("ai:setConfig", cfg),
  testCapabilities: (modelId: string) => invoke("ai:testCapabilities", modelId),
  saveSecret: (key: string, value: string) => invoke("secrets:save", { key, value }),
  removeSecret: (key: string) => invoke("secrets:remove", key),
  openQuestLink: (url: string) => invoke("quest:openLink", url),
  openExternal: (url: string) => invoke("shell:openExternal", { url }),
  listLearningRules: () => invoke("learning:list"),
  refreshClioIndex: () => invoke("clio:refreshIndex"),
  safetySelfCheck: () => invoke("safety:selfCheck"),
  connectorsStatus: () => invoke<Record<string, unknown>>("connectors:status"),
  saveConnectorCredentials: (creds: Record<string, string>) =>
    invoke("connectors:saveCredentials", creds),
  connectConnector: (id: "gmail" | "clio" | "drive") =>
    invoke("connectors:connect", { id }),
  disconnectConnector: (id: "gmail" | "clio" | "drive") =>
    invoke("connectors:disconnect", { id }),
};

contextBridge.exposeInMainWorld("mattermail", api);

export type MattermailApi = typeof api;

declare global {
  interface Window {
    mattermail: MattermailApi;
  }
}

void z;
