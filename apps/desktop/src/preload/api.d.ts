import type { TinderApi } from "./index";

declare global {
  interface Window {
    tinder: TinderApi;
  }
}

export {};
