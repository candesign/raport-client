/* global Papa */

const ui = {
  dataFile: document.getElementById("dataFile"),
  clientsFile: document.getElementById("clientsFile"),
  categoriesFile: document.getElementById("categoriesFile"),
  generateBtn: document.getElementById("generateBtn"),
  downloadLink: document.getElementById("downloadLink"),
  status: document.getElementById("status"),
  previewTable: document.getElementById("previewTable"),
};

const OUTPUT_COLUMNS = [
  "Nr",
  "Model",
  "Numer seryjny",
  "Kategoria produktu",
  "Numer klienta",
  "Punkt handlowy",
  "Wartość bonu",
  "Data akceptacji",
];

function setStatus(message, { isError = false } = {}) {
  ui.status.textContent = message || "";
  ui.status.classList.toggle("error", Boolean(isError));
}

function normKey(value) {
  if (value == null) return "";
  const v = String(value).trim().replace(/^"+|"+$/g, "");
  return v.replace(/\s+/g, " ");
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error || new Error("Nie udało się odczytać pliku"));
    reader.readAsText(file);
  });
}

function parseCsv(text, { delimiter = ";" } = {}) {
  const result = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter,
    quoteChar: '"',
  });

  if (result.errors?.length) {
    const top = result.errors.slice(0, 3).map((e) => `${e.type}: ${e.message}`).join("\n");
    throw new Error(`Błąd parsowania CSV:\n${top}`);
  }

  return Array.isArray(result.data) ? result.data : [];
}

function makeMap(rows, keyField, valueField) {
  const map = new Map();
  for (const row of rows) {
    const key = normKey(row?.[keyField]);
    const val = String(row?.[valueField] ?? "").trim().replace(/^"+|"+$/g, "");
    if (key) map.set(key, val);
  }
  return map;
}

function buildOutputRows(dataRows, klientByPoint, categoryEnByPl) {
  let processed = 0;
  let written = 0;
  const out = [];

  for (const row of dataRows) {
    processed += 1;

    const status = String(row?.["Status"] ?? "").trim().replace(/^"+|"+$/g, "");
    if (status !== "approved") continue;

    const nr = String(row?.["Nr"] ?? "").trim();
    const model = String(row?.["Model"] ?? "").trim();
    const serial = String(row?.["Numer seryjny"] ?? "").trim();

    const categoryPl = String(row?.["Kategoria"] ?? "").trim();
    const categoryEn = categoryEnByPl.get(normKey(categoryPl)) || categoryPl;

    const point = String(row?.["Punkt handlowy"] ?? "").trim();
    const klientNo = klientByPoint.get(normKey(point)) || "";

    const bonus = String(row?.["Kwota cashback"] ?? "").trim();
    const acceptedAt = String(row?.["Data akceptacji"] ?? "").trim();

    out.push({
      "Nr": nr,
      "Model": model,
      "Numer seryjny": serial,
      "Kategoria produktu": categoryEn,
      "Numer klienta": klientNo,
      "Punkt handlowy": point,
      "Wartość bonu": bonus,
      "Data akceptacji": acceptedAt,
    });
    written += 1;
  }

  return { processed, written, out };
}

function renderPreview(rows) {
  const thead = ui.previewTable.querySelector("thead");
  const tbody = ui.previewTable.querySelector("tbody");
  thead.innerHTML = "";
  tbody.innerHTML = "";

  const headTr = document.createElement("tr");
  for (const col of OUTPUT_COLUMNS) {
    const th = document.createElement("th");
    th.textContent = col;
    headTr.appendChild(th);
  }
  thead.appendChild(headTr);

  for (const row of rows.slice(0, 20)) {
    const tr = document.createElement("tr");
    for (const col of OUTPUT_COLUMNS) {
      const td = document.createElement("td");
      td.textContent = row[col] ?? "";
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

function makeDownload(csvText, filename = "output.csv") {
  if (ui.downloadLink.dataset.objectUrl) {
    URL.revokeObjectURL(ui.downloadLink.dataset.objectUrl);
  }

  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  ui.downloadLink.href = url;
  ui.downloadLink.download = filename;
  ui.downloadLink.hidden = false;
  ui.downloadLink.dataset.objectUrl = url;
}

async function getClientsCsvText() {
  if (ui.clientsFile.files?.[0]) return await readFileAsText(ui.clientsFile.files[0]);
  throw new Error("Wybierz plik klienci.csv.");
}

async function getCategoriesCsvText() {
  if (ui.categoriesFile.files?.[0]) return await readFileAsText(ui.categoriesFile.files[0]);
  throw new Error("Wybierz plik kategorie.csv.");
}

async function onGenerate() {
  try {
    ui.generateBtn.disabled = true;
    ui.downloadLink.hidden = true;
    setStatus("Przetwarzam…");

    const dataFile = ui.dataFile.files?.[0];
    if (!dataFile) throw new Error("Wybierz plik data.csv.");

    const [dataText, clientsText, categoriesText] = await Promise.all([
      readFileAsText(dataFile),
      getClientsCsvText(),
      getCategoriesCsvText(),
    ]);

    const dataRows = parseCsv(dataText, { delimiter: ";" });
    const clientsRows = parseCsv(clientsText, { delimiter: ";" });
    const categoriesRows = parseCsv(categoriesText, { delimiter: ";" });

    const klientByPoint = makeMap(clientsRows, "Klient", "Numer klienta");
    const categoryEnByPl = makeMap(categoriesRows, "Kategoria PL", "Kategoria EN");

    const { processed, written, out } = buildOutputRows(dataRows, klientByPoint, categoryEnByPl);

    const csvOut = Papa.unparse(out, {
      columns: OUTPUT_COLUMNS,
      delimiter: ";",
      quotes: false,
      newline: "\n",
    });

    makeDownload(csvOut, "output.csv");
    renderPreview(out);

    setStatus(
      `OK.\nPrzetworzono wierszy: ${processed}\nZapisano (Status=approved): ${written}\n\nUwaga: jeśli nie znaleziono Numeru klienta dla punktu handlowego, pole pozostaje puste.`
    );
  } catch (err) {
    console.error(err);
    setStatus(err?.message ? String(err.message) : "Wystąpił błąd.", { isError: true });
  } finally {
    ui.generateBtn.disabled = false;
  }
}

ui.generateBtn.addEventListener("click", onGenerate);

