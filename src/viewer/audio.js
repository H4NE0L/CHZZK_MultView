globalThis.CZAudio = {create(context) {
  const {tileMap, syncVolumeUI, saveStateSoon, saveState} = context;
  /* ------------------------------------------------------------------
     Volume model
       channel.volume  : each broadcast's own volume (0..1)
       channel.muted   : each broadcast's own mute switch
       context.state.masterVolume : the extension's overall volume (0..1)

     What a player actually receives is channel.volume * masterVolume.
     The master volume never rewrites channel.volume, so moving it does not
     disturb the individual settings. "Main only" is applied on top as a
     temporary forced mute for every non-main broadcast.
  ------------------------------------------------------------------ */

  function clamp01(value) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
  }

  function mainUid() {
    if (context.state.selectedUid && context.state.channels.some(c => c.uid === context.state.selectedUid)) return context.state.selectedUid;
    return context.state.channels[0]?.uid || null;
  }

  function effectiveVolume(channel) {
    return clamp01(channel.volume ?? 1) * clamp01(context.state.masterVolume ?? 1);
  }

  function isForcedMuted(channel) {
    return clamp01(context.state.masterVolume ?? 1) <= 0 || (context.state.mainOnly === true && channel.uid !== mainUid());
  }

  function effectiveMuted(channel) {
    return channel.muted === true || clamp01(channel.volume ?? 1) <= 0 || isForcedMuted(channel);
  }

  function sendTileVolume(uid) {
    const channel = context.state.channels.find(c => c.uid === uid);
    const iframe = tileMap.get(uid)?.querySelector("iframe");
    if (!channel || !iframe) return;
    try {
      CZMessages.postToPlayer(iframe, {
        source: "chzzk-multiview",
        type: "SET_VOLUME",
        volume: effectiveVolume(channel),
        muted: effectiveMuted(channel)
      });
    } catch (_) {}
  }

  function sendAllTileVolumes() {
    for (const uid of tileMap.keys()) sendTileVolume(uid);
  }

  function setTileVolume(uid, volume) {
    const channel = context.state.channels.find(c => c.uid === uid);
    if (!channel) return;
    channel.volume = clamp01(volume);
    channel.muted = channel.volume <= 0;
    if(!effectiveMuted(channel))context.ensureAudible?.();
    sendTileVolume(uid);
    syncVolumeUI();
    saveStateSoon();
  }

  function toggleTileMute(uid) {
    const channel = context.state.channels.find(c => c.uid === uid);
    if (!channel) return;
    const silent = channel.muted === true || clamp01(channel.volume ?? 1) <= 0;
    if (silent) {
      channel.muted = false;
      if (clamp01(channel.volume ?? 1) <= 0) channel.volume = 0.5;
    } else {
      channel.muted = true;
    }
    if(!effectiveMuted(channel))context.ensureAudible?.();
    sendTileVolume(uid);
    syncVolumeUI();
    saveStateSoon();
  }

  function setMasterVolume(value) {
    context.state.masterVolume = clamp01(value);
    if(context.state.channels.some(channel=>!effectiveMuted(channel)))context.ensureAudible?.();
    sendAllTileVolumes();
    syncVolumeUI();
    saveStateSoon();
  }

  function toggleMasterMute() {
    const current = clamp01(context.state.masterVolume ?? 1);
    if (current <= 0) {
      context.state.masterVolume = clamp01(context.state._previousMasterVolume ?? 1);
      if (context.state.masterVolume <= 0) context.state.masterVolume = 1;
    } else {
      context.state._previousMasterVolume = current;
      context.state.masterVolume = 0;
    }
    if(context.state.channels.some(channel=>!effectiveMuted(channel)))context.ensureAudible?.();
    sendAllTileVolumes();
    syncVolumeUI();
    saveStateSoon();
  }

  function makeMainAudible() {
    const main = context.state.channels.find(c => c.uid === mainUid());
    if (!main) return;
    main.muted = false;
    if (clamp01(main.volume ?? 1) <= 0) main.volume = 0.5;
    if(!effectiveMuted(main))context.ensureAudible?.();
  }

  function setMainOnly(on) {
    context.state.mainOnly = !!on;
    if (context.state.mainOnly) makeMainAudible();
    if(context.state.channels.some(channel=>!effectiveMuted(channel)))context.ensureAudible?.();
    sendAllTileVolumes();
    syncVolumeUI();
    saveState();
  }

  function receiveVideoState(message) {
    const channel = context.state.channels.find(c => c.uid === message.uid);
    if (!channel || message.reason !== 'player') return;
    if(isForcedMuted(channel)){sendTileVolume(channel.uid);return;}
    const master = clamp01(context.state.masterVolume ?? 1);
    if (master > 0 && typeof message.volume === 'number' && Number.isFinite(message.volume)) channel.volume = clamp01(message.volume / master);
    if (typeof message.muted === 'boolean') channel.muted = message.muted || channel.volume <= 0;
    if(Math.abs(message.volume-effectiveVolume(channel))>0.00001 || message.muted!==effectiveMuted(channel))sendTileVolume(channel.uid);
    if(!effectiveMuted(channel))context.ensureAudible?.();
    syncVolumeUI();
    saveStateSoon();
  }
  return {clamp01, mainUid, effectiveVolume, isForcedMuted, effectiveMuted, sendTileVolume, sendAllTileVolumes, setTileVolume, toggleTileMute, setMasterVolume, toggleMasterMute, makeMainAudible, setMainOnly, receiveVideoState};
}};
