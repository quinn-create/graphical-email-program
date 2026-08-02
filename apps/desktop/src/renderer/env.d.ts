import type { MattermailApi } from "../../preload/index";

declare global {
  interface Window {
    mattermail: MattermailApi;
  }
}

export {};
