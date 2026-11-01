"use strict";
(() => {
  // src/shared/important-chat.ts
  var record = (value) => value && typeof value === "object" ? value : {};
  var importantChat = /* @__PURE__ */ (() => {
    const KEY = "chzzkImportantChatV1", LIMIT = 100;
    const clean = (value) => typeof value === "string" ? value.normalize("NFC").trim() : "";
    const nameKey = (value) => clean(value).toLocaleLowerCase("ko-KR");
    const nameList = (value) => [...new Map((Array.isArray(value) ? value : []).filter((n) => typeof n === "string").map((n) => clean(n).slice(0, 40)).filter(Boolean).map((n) => [nameKey(n), n])).values()].slice(0, 50);
    function settings(input = {}) {
      const value = record(input);
      return {
        nativeHideBadges: value.nativeHideBadges === true,
        hideBadges: value.hideBadges === true,
        enabled: value.enabled !== false,
        streamers: value.streamers !== false,
        managers: value.managers !== false,
        partners: value.partners !== false,
        names: nameList(value.names),
        excludedNames: nameList(value.excludedNames)
      };
    }
    function imageUrl(value) {
      if (typeof value !== "string" || value.length > 2048) return "";
      try {
        const url = new URL(value);
        return url.protocol === "https:" && !url.username && !url.password && !url.port && (url.hostname === "pstatic.net" || url.hostname.endsWith(".pstatic.net")) ? url.href : "";
      } catch (_) {
        return "";
      }
    }
    function segments(value, fallback) {
      if (!Array.isArray(value)) return [{ type: "text", text: fallback }];
      const result = [];
      let remaining = 1e3, images = 0;
      for (const raw of value.slice(0, 64)) {
        const part = record(raw);
        if (!part || remaining <= 0) continue;
        if (part.type === "image") {
          const alt = clean(part.alt).slice(0, 80) || "[이모티콘]", src = imageUrl(part.src);
          if (src && images < 8) {
            result.push({ type: "image", src, alt });
            images++;
            remaining -= alt.length;
            continue;
          }
          result.push({ type: "text", text: alt.slice(0, remaining) });
          remaining -= alt.length;
        } else if (part.type === "text" && typeof part.text === "string") {
          const text = part.text.slice(0, remaining);
          if (text) result.push({ type: "text", text });
          remaining -= text.length;
        }
      }
      return result.length ? result : [{ type: "text", text: fallback }];
    }
    function timestamp(value) {
      if (value == null || value === "") return null;
      const numeric = Number(value), time = Number.isFinite(numeric) ? numeric * (numeric < 1e11 ? 1e3 : 1) : Date.parse(String(value));
      return Number.isFinite(time) && time >= 9466848e5 && time <= Date.now() + 6e4 ? time : null;
    }
    function message(input) {
      const value = record(input);
      if (!value || typeof value.id !== "string" || !value.id || value.id.length > 160 || typeof value.name !== "string" || typeof value.text !== "string") return null;
      const name = clean(value.name).slice(0, 80), parts = segments(value.segments, clean(value.text));
      const text = (clean(value.text) || parts.map((part) => part.type === "image" ? part.alt : part.text).join("")).slice(0, 1e3);
      if (!name || !text) return null;
      const color = (input2) => typeof input2 === "string" && /^(?:#[a-f\d]{3,8}|rgba?\([\d.,%\s]+\))$/i.test(input2) && input2.length <= 80 ? input2 : "";
      const svg = (input2) => {
        const value2 = record(input2);
        if (typeof value2.viewBox !== "string" || !/^[-\d.eE+,\s]+$/.test(value2.viewBox) || value2.viewBox.length > 80 || !Array.isArray(value2.shapes)) return null;
        const shapes = value2.shapes.slice(0, 8).flatMap((raw) => {
          const shape = record(raw);
          if (typeof shape.tag !== "string" || !["path", "circle", "rect", "ellipse", "line", "polygon", "polyline"].includes(shape.tag)) return [];
          const attrs = {};
          for (const [key, input3] of Object.entries(record(shape.attrs))) {
            if (typeof input3 !== "string" || input3.length > 2048) continue;
            if (key === "d" && /^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\s-]+$/.test(input3)) attrs[key] = input3;
            else if (["fill", "stroke"].includes(key) && (color(input3) || ["none", "currentColor"].includes(input3))) attrs[key] = input3;
            else if (["cx", "cy", "r", "x", "y", "width", "height", "rx", "ry", "x1", "x2", "y1", "y2", "points", "stroke-width"].includes(key) && /^[-\d.eE+,\s]+$/.test(input3) && input3.length <= 120) attrs[key] = input3;
          }
          return [{ tag: shape.tag, attrs }];
        });
        return shapes.length ? { viewBox: value2.viewBox, color: color(value2.color), shapes } : null;
      };
      const decorations = (input2) => (Array.isArray(input2) ? input2 : []).slice(0, 8).flatMap((raw) => {
        const badge = record(raw), src = imageUrl(badge.src), alt = clean(badge.alt).slice(0, 80), icon = svg(badge.svg);
        if (badge.src && !src) return [];
        return src || alt || icon ? [{ src, alt, svg: icon }] : [];
      });
      return { id: value.id, name, text, updateOnly: value.updateOnly === true, segments: parts, badges: decorations(value.badges), badgesAfter: decorations(value.badgesAfter), nameColor: color(value.nameColor), bodyColor: color(value.bodyColor), role: typeof value.role === "string" && ["streamer", "manager", "partner"].includes(value.role) ? value.role : "", time: typeof value.time === "number" && Number.isFinite(value.time) && Math.abs(value.time) <= 864e13 ? value.time : null };
    }
    function matches(item, filter) {
      return filter.enabled && !(filter.excludedNames || []).some((n) => nameKey(n) === nameKey(item.name)) && (item.role === "streamer" && filter.streamers || item.role === "manager" && filter.managers || item.role === "partner" && filter.partners || filter.names.some((n) => nameKey(n) === nameKey(item.name)));
    }
    function create() {
      let uid = null, items = [];
      return {
        reset(next) {
          uid = next;
          items = [];
        },
        get uid() {
          return uid;
        },
        get items() {
          return items.slice();
        },
        clear() {
          items = [];
        },
        applySettings(filter) {
          items = items.filter((item) => !(filter.excludedNames || []).some((name) => nameKey(name) === nameKey(item.name)));
        },
        add(channel, batch, filter) {
          if (channel !== uid || !filter.enabled || !Array.isArray(batch)) return false;
          let changed = false;
          for (const raw of batch.slice(0, LIMIT)) {
            const item = message(raw);
            if (!item || !matches(item, filter)) continue;
            const existing = items.findIndex((old) => old.id === item.id);
            if (existing < 0 && item.updateOnly) continue;
            if (existing >= 0) {
              if (JSON.stringify(items[existing]) === JSON.stringify(item)) continue;
              items[existing] = item;
            } else items.push(item);
            if (items.length > LIMIT) items.shift();
            changed = true;
          }
          return changed;
        }
      };
    }
    return { KEY, LIMIT, settings, message, matches, create, imageUrl, timestamp };
  })();
  globalThis.CZImportantChat = importantChat;
})();
