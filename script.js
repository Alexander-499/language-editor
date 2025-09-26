// ====================== Column Resizing (no min/max, ignores content) ======================
function enableResize() {
  let currentTh = null, startX = 0, startWidth = 0;

  document.querySelectorAll("th .resizer").forEach(resizer => {
    resizer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      currentTh = e.target.parentElement;
      startX = e.pageX;
      startWidth = currentTh.offsetWidth;
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  });

  function onMouseMove(e) {
    if (!currentTh) return;
    const newWidth = startWidth + (e.pageX - startX) - 16;
    currentTh.style.width = newWidth + "px"; // no constraints
  }
  function onMouseUp() {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    currentTh = null;
  }
}

// ====================== State ======================
let dirHandle = null;
let languages = {};        // { filename: { flatKey: value } }
let keyOrder = [];         // preserves row order
const table   = document.querySelector("table");
const tbody   = table.querySelector("tbody");
const theadTr = table.querySelector("thead tr");

// ====================== Helpers ======================
function flatten(obj, prefix = "", res = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) flatten(v, key, res);
    else res[key] = v;
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
function showStatus(msg) {
  let bar = document.getElementById("statusBar");
  if (!bar) {
    bar = document.createElement("div");
    bar.id = "statusBar";
    Object.assign(bar.style, {
      position: "fixed", bottom: "10px", left: "50%", transform: "translateX(-50%)",
      background: "#333", color: "#fff", padding: "4px 10px", borderRadius: "4px",
      fontSize: "14px", zIndex: 9999, transition: "opacity .2s"
    });
    document.body.appendChild(bar);
  }
  bar.textContent = msg;
  bar.style.opacity = "1";
  clearTimeout(bar._t);
  bar._t = setTimeout(() => { bar.style.opacity = "0"; }, 1200);
}

// ====================== Render ======================
function renderTable() {
  // header
  theadTr.innerHTML = "";
  const thKey = document.createElement("th");
  thKey.textContent = "Key";
  thKey.appendChild(document.createElement("div")).className = "resizer";
  theadTr.appendChild(thKey);

  const langFiles = Object.keys(languages);
  langFiles.forEach(fname => {
    const th = document.createElement("th");
    const span = document.createElement("span");
    span.contentEditable = true;
    span.textContent = fname;
    th.appendChild(span);
    th.appendChild(document.createElement("div")).className = "resizer";
    theadTr.appendChild(th);
  });

  // gather keys maintaining keyOrder
  const seen = new Set(keyOrder);
  Object.values(languages).forEach(flat => {
    Object.keys(flat).forEach(k => { if (!seen.has(k)) { keyOrder.push(k); seen.add(k); } });
  });

  // body
  tbody.innerHTML = "";
  keyOrder.forEach(key => {
    const tr = document.createElement("tr");
    tr.dataset.key = key;

    const tdKey = document.createElement("td");
    tdKey.contentEditable = true;
    tdKey.textContent = key;
    tr.appendChild(tdKey);

    langFiles.forEach(fname => {
      const td = document.createElement("td");
      td.contentEditable = true;
      td.textContent = languages[fname][key] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });

  enableResize();
  enableDragAndDrop();
}

// ====================== File Handling ======================
async function openFolder() {
  dirHandle = await window.showDirectoryPicker();
  await verifyPermission(dirHandle, true);
  localStorage.setItem("langDir", await serializeHandle(dirHandle));
  await loadLanguages();
  keyOrder = []; // reset order; will be rebuilt in render
  renderTable();
}
async function loadLanguages() {
  languages = {};
  for await (const entry of dirHandle.values()) {
    if (entry.kind === "file" && entry.name.endsWith(".json")) {
      const file = await entry.getFile();
      try {
        const json = JSON.parse(await file.text());
        languages[entry.name] = flatten(json);
      } catch (e) {
        console.error("Invalid JSON:", entry.name, e);
      }
    }
  }
}
async function saveAll() {
  const langFiles = Object.keys(languages);
  const rows = [...tbody.querySelectorAll("tr")];

  // rebuild from DOM (so order + edits are honored)
  const filesData = {}; // { fname: { flatKey: value } }
  rows.forEach(row => {
    const cells = row.querySelectorAll("td");
    const key = row.dataset.key || cells[0].textContent.trim();
    if (!key) return;
    langFiles.forEach((fname, i) => {
      const val = cells[i + 1].textContent.trim();
      (filesData[fname] ||= {})[key] = val;
    });
  });

  // write files preserving order by iterating keyOrder
  for (const fname of langFiles) {
    const flat = {};
    keyOrder.forEach(k => {
      if (filesData[fname] && k in filesData[fname]) flat[k] = filesData[fname][k];
    });
    const jsonText = JSON.stringify(unflatten(flat), null, 2);
    const fh = await dirHandle.getFileHandle(fname, { create: true });
    const w = await fh.createWritable();
    await w.write(jsonText);
    await w.close();
  }
  showStatus("Saved ✔");
}

// ====================== Add / Delete ======================
function addKey(insertAfter = null) {
  const tr = document.createElement("tr");
  tr.dataset.key = "";

  const tdKey = document.createElement("td");
  tdKey.contentEditable = true;

  // Update dataset + keyOrder when editing
  tdKey.addEventListener("input", () => {
    const oldKey = tr.dataset.key;
    const newKey = tdKey.textContent.trim();

    // replace in keyOrder
    if (oldKey && oldKey !== newKey) {
      keyOrder = keyOrder.map(k => (k === oldKey ? newKey : k));
    } else if (!oldKey && newKey) {
      keyOrder.push(newKey);
    }

    tr.dataset.key = newKey;
  });

  tr.appendChild(tdKey);

  Object.keys(languages).forEach(() => {
    const td = document.createElement("td");
    td.contentEditable = true;
    tr.appendChild(td);
  });

  if (insertAfter) {
    tbody.insertBefore(tr, insertAfter.nextSibling);
    const idx = keyOrder.indexOf(insertAfter.dataset.key);
    if (idx >= 0) keyOrder.splice(idx + 1, 0, "");
  } else {
    tbody.appendChild(tr);
    keyOrder.push("");
  }

  enableDragAndDrop();
}

function addLanguage() {
  const name = prompt("Enter new language filename (e.g. fr.json):");
  if (!name) return;
  if (languages[name]) { showStatus("Language already exists"); return; }
  languages[name] = {};
  renderTable();
}

// Right-click on first column to delete row (all languages)
tbody.addEventListener("contextmenu", (e) => {
  const td = e.target.closest("td");
  if (!td) return;
  const tr = td.parentElement;
  if (td.cellIndex !== 0) return;
  e.preventDefault();
  const keyName = td.textContent.trim();
  if (!keyName) { tr.remove(); return; }
  if (confirm(`Delete key "${keyName}" in all languages?`)) {
    // remove from in-memory languages so refresh doesn't resurrect it
    Object.values(languages).forEach(flat => { delete flat[keyName]; });
    // remove from order + DOM
    keyOrder = keyOrder.filter(k => k !== keyName);
    tr.remove();
    showStatus(`Deleted: ${keyName}`);
  }
});

// ====================== Shortcuts ======================
document.addEventListener("keydown", e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveAll();
  }
});

// ====================== Permissions & Persistence ======================
async function verifyPermission(handle, withWrite) {
  const opts = withWrite ? { mode: "readwrite" } : {};
  if ((await handle.queryPermission(opts)) === "granted") return true;
  return (await handle.requestPermission(opts)) === "granted";
}
// Minimal serialization placeholder (real persisted handles need storage APIs w/ user grant)
async function serializeHandle(handle) { return handle.name; }

// Try restore (note: browsers often require re-pick for security)
(async () => {
  const stored = localStorage.getItem("langDir");
  if (stored) showStatus("Tip: Click the folder to re-open last directory");
})();

tbody.addEventListener("contextmenu", (e) => {
  const td = e.target.closest("td");
  if (!td) return;
  if (td.cellIndex === 0) return; // 🚫 ignore first column

  e.preventDefault();
  const tr = td.parentElement;

  const rect = tr.getBoundingClientRect();
  const clickY = e.clientY;

  if (clickY < rect.top + rect.height / 2) {
    // clicked in top half → insert before
    addKey(tr.previousSibling);
  } else {
    // clicked in bottom half → insert after
    addKey(tr);
  }
});

tbody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
});

document.addEventListener("keydown", (e) => {
  const selected = tbody.querySelector("tr.selected");
  if (!selected) return;

  if (e.key === "ArrowUp") {
    e.preventDefault();
    const prev = selected.previousElementSibling;
    if (prev) {
      tbody.insertBefore(selected, prev);
      updateKeyOrderFromDOM();
    }
  }

  if (e.key === "ArrowDown") {
    e.preventDefault();
    const next = selected.nextElementSibling;
    if (next) {
      tbody.insertBefore(next, selected);
      updateKeyOrderFromDOM();
    }
  }

  // Select row on click
tbody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;
  tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");
});

// Deselect when clicking outside the table
document.addEventListener("click", (e) => {
  const insideTable = e.target.closest("table");
  if (!insideTable) {
    tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  }
});

});

// Select row on click
tbody.addEventListener("click", (e) => {
  const tr = e.target.closest("tr");
  if (!tr) return;

  // clear old selection
  tbody.querySelectorAll("tr").forEach(r => r.classList.remove("selected"));
  tr.classList.add("selected");

  // one-time listener to deselect if click is outside this row
  const deselect = (ev) => {
    if (!tr.contains(ev.target)) {
      tr.classList.remove("selected");
      document.removeEventListener("click", deselect);
    }
  };
  document.addEventListener("click", deselect);
});


function updateKeyOrderFromDOM() {
  keyOrder = [...tbody.querySelectorAll("tr")].map(tr => tr.dataset.key || tr.cells[0].textContent.trim());
}

// ====================== Bind UI Buttons ======================
document.getElementById("openFolderButton").onclick   = openFolder;
document.getElementById("saveButton").onclick         = saveAll;
document.getElementById("addKeyButton").onclick       = addKey;
document.getElementById("addLanguageButton").onclick  = addLanguage;
document.getElementById("refreshButton").onclick      = renderTable;