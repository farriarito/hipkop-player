interface HipkopPlaybackItem {
  id: string;
  title?: string;
  artist?: string;
  coverUrl?: string | null;
  previewUrl?: string | null;
  kind?: string;
  albumId?: string | null;
  externalUrl?: string | null;
  listen?: { platforms?: Array<{ url: string; exact?: boolean }> };
}
interface HipkopPlaybackState {
  item: HipkopPlaybackItem | null;
  id: string | null;
  title: string;
  artist: string;
  cover: string;
  status: 'idle' | 'loading' | 'playing' | 'paused' | 'ended' | 'error' | 'no-preview';
  currentTime: number;
  duration: number;
  queue: HipkopPlaybackItem[];
  index: number;
  message: string;
  externalUrl: string | null;
}
interface Window {
  HipkopCulture: {
    resource(value: unknown, fallback?: string): string;
    timestamp(value: string): string;
    actions(item: any, liked?: boolean): string;
    chartInfo(items: any[], sort?: string): string;
    podium(items: any[], cover: Function, isLiked: Function): string;
    archive(items: any[], cover: Function, isLiked: Function): string;
    post(post: any, topic: string, featured?: boolean): string;
    wall(items: any[], topic: Function): string;
    syncPlayback(state?: HipkopPlaybackState): void;
  };
  gsap: typeof import('gsap').gsap;
  ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger;
  HipkopArt: { stage(): string };
  HipkopExhibition: { stage(items?: HipkopPlaybackItem[]): string; syncPlayer(state?: HipkopPlaybackState): void };
  HipkopMotion: {
    clear(): void;
    mount(root: Element | null, options?: { entrance?: boolean }): void;
    swapHero(node: Element): void;
    pick(root: Element): void;
    sheet(card: Element): void;
    results(root: Element): void;
  };
  HipkopPlayer: {
    playItem(item: HipkopPlaybackItem | string): Promise<boolean>;
    playQueue(items: Array<HipkopPlaybackItem | string>): Promise<boolean>;
    toggle(): Promise<boolean>;
    next(): Promise<boolean>;
    previous(): Promise<boolean>;
    snapshot(): HipkopPlaybackState;
    setFeatured(items: HipkopPlaybackItem[]): void;
    toggleFeatured(): Promise<boolean>;
    on(listener: (state: HipkopPlaybackState) => void): () => void;
    pause(): void;
    readonly audio: HTMLAudioElement;
  };
}
