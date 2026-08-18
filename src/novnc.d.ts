declare module '@novnc/novnc' {
  export default class RFB {
    constructor(target: HTMLElement, url: string | URL, options?: Record<string, unknown>);
    scaleViewport: boolean;
    resizeSession: boolean;
    disconnect(): void;
    addEventListener(type: string, listener: EventListener): void;
    removeEventListener(type: string, listener: EventListener): void;
  }
}
