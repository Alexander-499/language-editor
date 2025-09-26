let currentTh, startX, startWidth;

document.querySelectorAll("th .resizer").forEach(resizer => {
  resizer.addEventListener("mousedown", (e) => {
    currentTh = e.target.parentElement;
    startX = e.pageX;
    startWidth = currentTh.offsetWidth;

    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });
});

function onMouseMove(e) {
  if (currentTh) {
    const newWidth = startWidth + (e.pageX - startX);
    currentTh.style.width = newWidth + "px";
  }
}

function onMouseUp() {
  document.removeEventListener("mousemove", onMouseMove);
  document.removeEventListener("mouseup", onMouseUp);
  currentTh = null;
}

let dirHandle = null;
let languages = {}; 
let table = document.querySelector("table");
let tbody = table.querySelector("tbody");
let theadRow = table.querySelector("thead tr");

// --- Helpers ---
function flatten(obj, prefix = "", res = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? prefix + "." + k : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      flatten(v, key, res);
    } else {
      res[key] = v;
    }
  }
  return res;
}

function unflatten(obj) {
  const res = {};
  for (const [key, value] of Object.entries(obj)) {
    key.split(".").reduce((acc, part, i, arr) => {
      if (i === arr.length - 1) acc[part] = value;
      else acc[part] = acc[part] || {};
      return acc[part];
    }, res);
  }
  return res;
}

// --- Status messages ---
function showStatus(msg, type = "ok") {
  let bar = document.getElementById("statusBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "statusBar";
    bar.style.position = "fixed";
    bar.style.bottom = "10px";
    bar.style.left = "50%";
    bar.style.transform = "translateX(-50%)";
    bar.style.background = "#333";
    bar.style.color = "#fff";
    bar.style.padding = "4px 10px";
    bar.style.borderRadius = "4px";
    bar.style.fontSize = "14px";
    bar.style.zIndex = 9999;
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
  bar.style.opacity = "1";
  setTimeout(() => {
    bar.style.opacity = "0";
  }, 1500);
}

// --- UI Rendering ---
function renderTable() {
  theadRow.innerHTML = "";
  tbody.innerHTML = "";

  let thKey = document.createElement("th");
  thKey.textContent = "Key";
  thKey.appendChild(document.createElement("div")).className = "resizer";
  theadRow.appendChild(thKey);

  Object.keys(languages).forEach(filename => {
    let th = document.createElement("th");
    let span = document.createElement("span");
    span.contentEditable = true;
    span.textContent = filename;
    th.appendChild(span);
    th.appendChild(document.createElement("div")).className = "resizer";
    theadRow.appendChild(th);
  });

  const allKeys = new Set();
  Object.values(languages).forEach(lang => {
    Object.keys(lang).forEach(k => allKeys.add(k));
  });

  allKeys.forEach(key => {
    const tr = document.createElement("tr");
    const tdKey = document.createElement("td");
    tdKey.contentEditable = true;
    tdKey.textContent = key;
    tr.appendChild(tdKey);

    Object.keys(languages).forEach(filename => {
      const td = document.createElement("td");
      td.contentEditable = true;
      td.textContent = languages[filename][key] || "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  enableResize();
}

// --- Column Resizing ---
function enableResize() {
  let currentTh = null, startX = 0, startWidth = 0;

  document.querySelectorAll("th .resizer").forEach(resizer => {
    resizer.onmousedown = e => {
      currentTh = e.target.parentElement;
      startX = e.clientX;
      startWidth = currentTh.offsetWidth;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    };
  });

  function onMouseMove(e) {
    if (!currentTh) return;
    const dx = e.clientX - startX;
    currentTh.style.width = Math.max(startWidth + dx, 60) + "px";
  }
  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    currentTh = null;
  }
}

// --- File handling ---
async function openFolder() {
  dirHandle = await window.showDirectoryPicker();
  await verifyPermission(dirHandle, true);
  localStorage.setItem("langDir", await serializeHandle(dirHandle));
  await loadLanguages();
  renderTable();
}

async function loadLanguages() {
  languages = {};
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".json")) {
      const file = await entry.getFile();
      const text = await file.text();
      try {
        const json = JSON.parse(text);
        languages[entry.name] = flatten(json);
      } catch (e) {
        console.error("Invalid JSON in", entry.name, e);
      }
    }
  }
}

async function saveAll() {
  const rows = tbody.querySelectorAll("tr");
  const filesData = {};
  rows.forEach(tr => {
    const tds = tr.querySelectorAll("td");
    const key = tds[0].textContent.trim();
    if (!key) return;
    Array.from(tds).slice(1).forEach((td, i) => {
      const filename = Object.keys(languages)[i];
      filesData[filename] = filesData[filename] || {};
      filesData[filename][key] = td.textContent.trim();
    });
  });

  for (const [filename, flatObj] of Object.entries(filesData)) {
    const json = JSON.stringify(unflatten(flatObj), null, 2);
    const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  showStatus("Saved ✔");
}

// --- Adding keys/languages ---
function addKey() {
  const tr = document.createElement("tr");
  const tdKey = document.createElement("td");
  tdKey.contentEditable = true;
  tr.appendChild(tdKey);

  Object.keys(languages).forEach(() => {
    const td = document.createElement("td");
    td.contentEditable = true;
    tr.appendChild(td);
  });
  tbody.appendChild(tr);
}

function addLanguage() {
  const name = prompt("Enter new language filename (e.g. fr.json):");
  if (!name) return;
  languages[name] = {};
  renderTable();
}

// --- Shortcuts ---
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
    saveAll();
  }
});

// --- Permissions ---
async function verifyPermission(handle, withWrite) {
  const opts = {};
  if (withWrite) opts.mode = "readwrite";
  if ((await handle.queryPermission(opts)) === "granted") {
    return true;
  }
  if ((await handle.requestPermission(opts)) === "granted") {
    return true;
  }
  return false;
}

// Serialize/deserialize handles (uses Origin Private File System persistence)
async function serializeHandle(handle) {
  return await handle.name; // simplified fallback
}

// --- Try restore on load ---
(async () => {
  const stored = localStorage.getItem("langDir");
  if (stored) {
    try {
      // 👇 NOTE: Currently, only Chrome remembers handles persistently if you request it.
      // In many cases you’ll still need to re-pick the folder.
      showStatus("Please re-open folder (browser security)");
    } catch (e) {
      console.warn("Restore failed", e);
    }
  }
})();

// --- Bind buttons ---
document.getElementById("openFolderButton").onclick = openFolder;
document.getElementById("saveButton").onclick = saveAll;
document.getElementById("addKeyButton").onclick = addKey;
document.getElementById("addLanguageButton").onclick = addLanguage;
document.getElementById("refreshButton").onclick = () => renderTable();