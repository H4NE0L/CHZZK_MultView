import type {ViewerSession, SessionChannel} from '../shared/contracts/session';
import type {ResourceScope} from '../shared/runtime/scope';
interface LayoutContext {
  readonly state: ViewerSession;
  readonly ui: HTMLElement | null;
  readonly videoGrid: HTMLElement | null;
  tileMap: Map<string, HTMLElement>;
  scope: ResourceScope;
  onRemove?(uid: string): void;
  createTile(channel: SessionChannel): void;
  sendTileVolume(uid: string): void;
  applyTileLock(tile: HTMLElement, locked: boolean): void;
  refreshChannelManager(): void;
  refreshVolumeManager(): void;
}
export function create(context: LayoutContext) {
  const {tileMap,scope,createTile,sendTileVolume,applyTileLock,refreshChannelManager,refreshVolumeManager}=context;
  let pendingFrame: (() => void) | null=null;
  function updateLayoutToggle() {
    const {ui,state}=context;
    if (!ui) return;
    ui.querySelectorAll<HTMLButtonElement>(".layout-toggle-btn").forEach(button => {
      const active = button.dataset.layout === state.layout;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  }

  function applyLayout() {
    const {videoGrid,state}=context;
    if (!videoGrid) return;

    videoGrid.classList.remove("layout-grid", "layout-2x2", "layout-3x3", "layout-main-sub");
    if (String(state.layout) === "2x2" || String(state.layout) === "3x3") state.layout = "grid";
    if (!["grid", "main-sub"].includes(state.layout)) state.layout = "grid";
    videoGrid.classList.add(`layout-${state.layout}`);

    // Keep the complete broadcast list in state, but only create player tiles
    // for broadcasts that are actually visible in the current layout. This
    // prevents hidden broadcasts from continuing to play audio.
    const displayMax = state.layout === "main-sub" ? 4 : 9;
    const visibleChannels = state.channels.slice(0, displayMax);
    const visibleUids = new Set(visibleChannels.map(c => c.uid));

    if (visibleChannels.length && !visibleUids.has(state.selectedUid || '')) {
      state.selectedUid = visibleChannels[0]!.uid;
    }

    // Remove tiles that are outside the visible range. Their iframe is
    // detached so it cannot continue playing audio in the background.
    for (const [uid, tile] of Array.from(tileMap.entries())) {
      if (visibleUids.has(uid)) continue;
      const iframe = tile.querySelector("iframe");
      if (iframe) iframe.src = "about:blank";
      const hiddenChannel = state.channels.find(c => c.uid === uid);
      if (hiddenChannel) hiddenChannel.muted = true;
      context.onRemove?.(uid);
      tile.remove();
      tileMap.delete(uid);
    }

    // Create tiles for the visible broadcasts only.
    for (const channel of visibleChannels) {
      createTile(channel);
    }

    // Update only CSS placement. Never append/move existing iframe nodes here:
    // DOM reparenting can cause CHZZK's player to reinitialize.
    visibleChannels.forEach((channel, index) => {
      const tile = tileMap.get(channel.uid);
      if (!tile) return;
      tile.style.display = "flex";
      tile.style.order = String(index);
      tile.style.gridColumn = "";
      tile.style.gridRow = "";
      tile.classList.toggle("main-tile", state.layout === "main-sub" && index === 0);
      tile.classList.remove("extra-main-sub");

      if (state.layout === "main-sub") {
        const mainOnLeft = state.chatSide === "left";
        if (index === 0) {
          tile.style.gridColumn = mainOnLeft ? "1" : "2";
          tile.style.gridRow = "1 / 4";
        } else {
          tile.style.gridColumn = mainOnLeft ? "2" : "1";
          tile.style.gridRow = String(index);
        }
      }

      sendTileVolume(channel.uid);
      applyTileLock(tile, state.screenLocked === true);
    });

    if (state.layout === "main-sub") {
      videoGrid.style.setProperty("--sub-count", String(Math.min(3, Math.max(1, visibleChannels.length - 1))));
    } else {
      videoGrid.style.removeProperty("--sub-count");
    }

    updateLayoutToggle();
    resizeFixedAspectGrid();
    refreshChannelManager();
    refreshVolumeManager();
  }

  function resizeFixedAspectGrid() {
    const {videoGrid}=context;
    if (!videoGrid) return;
    if(pendingFrame || scope.isDisposed)return;
    pendingFrame=scope.frame(() => {
      pendingFrame=null;
      const {state}=context;
      const layout=state.layout;
      if (!["grid", "main-sub"].includes(layout))return;
      const rect = videoGrid.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const gap = 8;

      if (layout === "main-sub") {
        // Main is on the RIGHT; up to three 16:9 sub tiles are stacked on
        // the LEFT. The main tile uses the remaining horizontal space.
        const subH = Math.max(1, (rect.height - gap * 2) / 3);
        const subW = subH * 16 / 9;
        const mainW = Math.max(1, rect.width - gap - subW);

        if (state.chatSide === "left") {
          videoGrid.style.gridTemplateColumns = `${mainW}px ${subW}px`;
        } else {
          videoGrid.style.gridTemplateColumns = `${subW}px ${mainW}px`;
        }
        videoGrid.style.gridTemplateRows = `repeat(3, ${subH}px)`;
        videoGrid.style.justifyContent = "center";
        videoGrid.style.alignContent = "center";
        videoGrid.style.overflow = "hidden";
        return;
      }

      // Basic layout scales by the number of visible broadcasts:
      // 1 -> 1x1, 2 -> 2x1, 3~4 -> 2x2, 5~6 -> 3x2, 7~9 -> 3x3.
      // Only the first 9 broadcasts are displayed; the full list is retained.
      // Dimensions are recalculated from the CURRENT viewport/grid size so
      // moving a maximized browser between different monitors automatically
      // resizes the tiles to fit the new screen.
      const count = Math.min(state.channels.length, 9);
      let cols = 1;
      let rows = 1;
      if (count >= 7) {
        cols = 3;
        rows = 3;
      } else if (count >= 5) {
        cols = 3;
        rows = 2;
      } else if (count >= 3) {
        cols = 2;
        rows = 2;
      } else if (count === 2) {
        cols = 2;
        rows = 1;
      }
      const cellW = Math.max(1, (rect.width - gap * (cols - 1)) / cols);
      const cellH = Math.max(1, (rect.height - gap * (rows - 1)) / rows);
      const tileW = Math.min(cellW, cellH * 16 / 9);
      const tileH = tileW * 9 / 16;

      videoGrid.style.gridTemplateColumns = `repeat(${cols}, ${tileW}px)`;
      videoGrid.style.gridTemplateRows = `repeat(${rows}, ${tileH}px)`;
      videoGrid.style.justifyContent = "center";
      videoGrid.style.alignContent = "center";
      videoGrid.style.overflow = "hidden";
    });
  }

  return {updateLayoutToggle,applyLayout,resizeFixedAspectGrid};
}
