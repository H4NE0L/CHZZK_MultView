"use strict";
(() => {
  // src/shared/backup-file.ts
  async function readJson(file) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const encoding = bytes[0] === 255 && bytes[1] === 254 ? "utf-16le" : bytes[0] === 254 && bytes[1] === 255 ? "utf-16be" : "utf-8";
    let text;
    try {
      text = new TextDecoder(encoding, { fatal: true }).decode(bytes).trim();
    } catch (_) {
      throw Error("파일 인코딩을 읽을 수 없습니다. 메모장에서 UTF-8로 저장한 JSON 파일을 선택해주세요.");
    }
    if (!text) throw Error("백업 파일이 비어 있습니다.");
    if (text === "undefined") throw Error("파일에 undefined만 들어 있습니다. 백업 코드를 실행한 뒤 메모장에 Ctrl+V로 붙여넣어 저장해주세요.");
    try {
      return JSON.parse(text);
    } catch (error) {
      throw Error("JSON 파일 문법을 읽을 수 없습니다. " + (error instanceof Error ? error.message.slice(0, 180) : ""));
    }
  }

  // src/shared/favorites-backup-ui.ts
  function attach(host, onRestored, options = {}) {
    host.innerHTML = '<div class="cg-backup-actions"><button class="cg-backup-export" type="button">즐겨찾기 백업</button><button class="cg-backup-import" type="button">백업 불러오기</button><button class="cg-backup-undo" type="button">불러오기 전 목록 복구</button><input class="cg-backup-file" type="file" accept=".json,application/json" hidden></div><div class="cg-backup-preview" hidden><p class="cg-backup-summary"></p><div class="cg-backup-controls"><select class="cg-backup-mode" aria-label="즐겨찾기 불러오기 방식"><option value="merge">기존 목록에 합치기</option><option value="replace">백업으로 교체</option></select><button class="cg-backup-apply" type="button">불러오기</button><button class="cg-backup-cancel" type="button">취소</button></div></div><p class="cg-backup-status" role="status"></p>';
    const full = options.settings === true, api = full ? CZSettingsBackupClient : CZFavoritesBackup;
    const $ = (selector) => host.querySelector(selector);
    const root = host.getRootNode();
    const status = $(".cg-backup-status"), preview = $(".cg-backup-preview"), input = $(".cg-backup-file");
    const mode = $(".cg-backup-mode"), apply = $(".cg-backup-apply");
    let pending = null, busy = false;
    function message(text) {
      const target = host.isConnected ? status : root.querySelector(".cg-backup-status");
      if (target) target.textContent = text;
    }
    function count(document) {
      return document.format === "cz-control-room-settings" ? document.data.favorites.data : document.data;
    }
    if (full) {
      $(".cg-backup-export").textContent = "설정 내보내기";
      $(".cg-backup-import").textContent = "설정 불러오기";
      $(".cg-backup-undo").textContent = "불러오기 전 설정 복구";
      mode.hidden = true;
    }
    function show(document, previous = false) {
      pending = document;
      preview.hidden = false;
      mode.value = full || previous ? "replace" : "merge";
      $(".cg-backup-summary").textContent = `${previous ? full ? "불러오기 전 설정" : "불러오기 전 목록" : "선택한 백업"}: 즐겨찾기 ${count(document).favorites.length}개 · 그룹 ${count(document).groups.length}개.${full ? " 전체 설정과 목록을 교체합니다. 열린 멀티뷰는 적용 후 새로고침하세요." : " 교체를 선택하면 현재 목록을 대신합니다."}`;
      message("아직 변경하지 않았습니다. 방식 확인 후 불러오기를 눌러주세요.");
    }
    function setBusy(value) {
      busy = value;
      host.querySelectorAll("button").forEach((button) => button.disabled = value);
      mode.disabled = value;
    }
    $(".cg-backup-export").onclick = async () => {
      setBusy(true);
      try {
        if (!options.prepareDestination) {
          const result = await chrome.runtime.sendMessage({ type: "OPEN_SETTINGS_BACKUP", kind: full ? "settings" : "favorites" });
          if (!result?.ok) throw Error(result?.error || "백업 탭을 열지 못했습니다.");
          message("백업 탭에서 프로젝트 폴더를 선택하고 저장해주세요.");
          return;
        }
        const save = await options.prepareDestination();
        const document = await api.create();
        const filename = await save(document, full ? "settings" : "favorites");
        message(`백업 파일을 저장했습니다: ${filename}`);
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    };
    $(".cg-backup-import").onclick = () => {
      if (!busy) {
        input.value = "";
        input.click();
      }
    };
    input.onchange = async () => {
      pending = null;
      preview.hidden = true;
      const file = input.files?.[0];
      if (!file) return;
      setBusy(true);
      try {
        if (file.size > api.MAX_BYTES) throw Error("백업 파일은 5MB 이하만 불러올 수 있습니다.");
        show(api.parse(await readJson(file)));
      } catch (error) {
        message(error instanceof SyntaxError ? "JSON 파일을 확인해주세요." : error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    };
    $(".cg-backup-undo").onclick = async () => {
      setBusy(true);
      pending = null;
      preview.hidden = true;
      try {
        const previous = await api.previous();
        if (previous) show(previous, true);
        else message("이 확장에서 불러오기 전 자동 보관한 목록이 없습니다.");
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    };
    $(".cg-backup-cancel").onclick = () => {
      pending = null;
      preview.hidden = true;
      message("불러오기를 취소했습니다.");
    };
    apply.onclick = async () => {
      if (!pending || busy) return;
      setBusy(true);
      try {
        const result = await api.restore(pending, mode.value === "replace" ? "replace" : "merge");
        pending = null;
        preview.hidden = true;
        await onRestored();
        message(`즐겨찾기 ${result.favorites.length}개를 불러왔습니다. 이전 ${full ? "설정" : "목록"}도 자동 보관했습니다.${full ? " 열린 멀티뷰를 새로고침하면 적용됩니다." : ""}`);
      } catch (error) {
        message(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    };
  }
  var favoritesBackupUI = Object.freeze({ attach });
  globalThis.CZFavoritesBackupUI = favoritesBackupUI;
})();
