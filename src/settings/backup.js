"use strict";
(() => {
  // src/shared/project-backup.ts
  var DATABASE = "chzzk-project-backup-v1";
  async function stored(mode, handle) {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore("directory");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return new Promise((resolve, reject) => {
      const transaction = db.transaction("directory", mode), store = transaction.objectStore("directory");
      const request = handle ? store.put(handle, "project") : store.get("project");
      transaction.oncomplete = () => {
        db.close();
        resolve(handle ?? request.result ?? null);
      };
      transaction.onerror = transaction.onabort = () => {
        db.close();
        reject(transaction.error || request.error);
      };
    });
  }
  async function choose() {
    const picker = window.showDirectoryPicker;
    if (!picker) throw Error("이 브라우저에서는 폴더 선택을 지원하지 않습니다. 최신 Chrome에서 백업 탭을 열어주세요.");
    const handle = await picker.call(window, { id: "cz-project-backup", mode: "readwrite" });
    await handle.getDirectoryHandle(".backup", { create: true });
    await stored("readwrite", handle);
    return handle;
  }
  async function current() {
    return stored("readonly");
  }
  async function prepare() {
    const handle = await current();
    if (!handle) throw Error("먼저 프로젝트 폴더를 선택해주세요.");
    let permission = await handle.queryPermission({ mode: "readwrite" });
    if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
    if (permission !== "granted") throw Error("선택한 폴더에 저장할 권한이 없습니다. 프로젝트 폴더를 다시 선택해주세요.");
    return async (document2, kind) => {
      const directory = await handle.getDirectoryHandle(".backup", { create: true });
      const date = /* @__PURE__ */ new Date(), stamp = date.toLocaleDateString("sv-SE") + "_" + [date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, "0")).join("");
      const filename = `CZ-${kind}-${stamp}-${crypto.randomUUID().slice(0, 8)}.json`;
      let writer = null;
      try {
        const file = await directory.getFileHandle(filename, { create: true });
        writer = await file.createWritable();
        await writer.write(JSON.stringify(document2, null, 2) + "\n");
        await writer.close();
      } catch (error) {
        await writer?.abort().catch(() => {
        });
        await directory.removeEntry(filename).catch(() => {
        });
        throw error;
      }
      return `${handle.name}/.backup/${filename}`;
    };
  }

  // src/settings/backup.ts
  var host = document.getElementById("settingsBackup");
  var folder = document.getElementById("projectFolder");
  var button = document.getElementById("chooseProject");
  if (!host || !folder || !button) throw Error("설정 백업 화면을 찾을 수 없습니다.");
  var favoriteOnly = new URL(location.href).searchParams.get("kind") === "favorites";
  if (favoriteOnly) {
    document.title = "즐겨찾기 백업 · 치지직 통합관제실";
    document.querySelector("header strong").textContent = "즐겨찾기 백업 / 불러오기";
    document.querySelector(".cg-body > p").textContent = "즐겨찾기·그룹·순서·강조색을 프로젝트 폴더의 .backup에 보관합니다.";
    document.querySelector(".cg-body > .cg-help").textContent = "불러오기는 기존 목록에 합치거나 교체할 수 있습니다. 다른 멀티뷰 설정은 변경하지 않습니다.";
  }
  current().then((handle) => {
    if (handle) folder.textContent = `백업 위치: ${handle.name}/.backup`;
  }).catch((error) => {
    folder.textContent = String(error);
  });
  button.onclick = async () => {
    button.disabled = true;
    try {
      const handle = await choose();
      folder.textContent = `백업 위치: ${handle.name}/.backup`;
    } catch (error) {
      folder.textContent = error instanceof DOMException && error.name === "AbortError" ? "폴더 선택을 취소했습니다." : error instanceof Error ? error.message : String(error);
    } finally {
      button.disabled = false;
    }
  };
  CZFavoritesBackupUI.attach(host, async () => {
  }, { settings: !favoriteOnly, prepareDestination: prepare });
})();
