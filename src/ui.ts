import type { ClockView, DetailModel, LabModel, LayerName, LayerView, QuakeSpan } from "./types.ts";

export interface UiHandlers {
  onToggle: (layer: LayerName, on: boolean) => void;
  onQuakeSpan: (span: QuakeSpan) => void;
  onSatGroup: (group: "stations" | "visual", on: boolean) => void;
  onPlay: () => void;
  onLive: () => void;
  onScrubStart: () => void;
  onScrub: (time: number) => void;
  onRate: (rate: number) => void;
  onHome: () => void;
  onDate: (date: string) => void;
  onSaveKey: (key: string) => void;
  onClearCache: () => void;
  onRetry: (layer: LayerName) => void;
  onCloseDetails: () => void;
}

export interface Ui {
  setLayer(name: LayerName, view: LayerView): void;
  setClock(view: ClockView): void;
  setDetails(model: DetailModel | null): void;
  setLab(model: LabModel): void;
  setImageryDate(iso: string): void;
  setKey(key: string): void;
  openSettings(): void;
  placeUpland(point: { x: number; y: number; visible: boolean }): void;
  toast(message: string): void;
}

interface LayerBits {
  root: HTMLElement;
  toggle: HTMLButtonElement;
  detail: HTMLElement;
  count: HTMLElement;
  retry: HTMLButtonElement;
  extra?: HTMLElement;
}

export function mountUi(root: HTMLElement, handlers: UiHandlers): Ui {
  const upland = el("div", "upland-label", "Upland");
  const layersButton = button("Layers", "ghost mobile-only");
  layersButton.setAttribute("aria-expanded", "false");

  const home = button("Upland", "ghost");
  home.title = "Fly to Upland, California";
  const labButton = button("Lab", "ghost");
  labButton.setAttribute("aria-pressed", "false");
  const settingsButton = button("Settings", "ghost");
  settingsButton.setAttribute("aria-pressed", "false");

  const brand = el("div", "brand");
  brand.innerHTML = `<svg viewBox="0 0 32 32" aria-hidden="true"><ellipse cx="16" cy="16" rx="12" ry="7.5" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="16" cy="16" r="3" fill="currentColor"/></svg>`;
  const titles = el("div", "brand-text");
  titles.append(el("h1", undefined, "God's Eye"), el("p", undefined, "Upland, California"));
  brand.prepend(titles);
  brand.insertBefore(brand.querySelector("svg")!, titles);

  const tools = el("div", "tools");
  tools.append(home, labButton, settingsButton, layersButton);
  const header = el("header", "topbar");
  header.append(brand, tools);

  const layerBits = new Map<LayerName, LayerBits>();
  const layerList = el("div", "layer-list");
  layerBits.set("imagery", makeLayer("imagery", "True color", handlers, layerList));
  layerBits.set("quakes", makeLayer("quakes", "Earthquakes", handlers, layerList));
  layerBits.set("fires", makeLayer("fires", "Active fires", handlers, layerList));
  layerBits.set("events", makeLayer("events", "Natural events", handlers, layerList));
  layerBits.set("satellites", makeLayer("satellites", "Satellites", handlers, layerList));
  layerBits.set("flights", makeLayer("flights", "Flights", handlers, layerList));

  const dateInput = document.createElement("input");
  dateInput.type = "date";
  dateInput.min = "2015-11-24";
  dateInput.setAttribute("aria-label", "VIIRS true-color date");
  dateInput.addEventListener("change", () => {
    if (dateInput.value) handlers.onDate(dateInput.value);
  });
  const dateRow = el("div", "extra");
  dateRow.append(el("span", "extra-label", "UTC date"), dateInput);
  layerBits.get("imagery")!.root.append(dateRow);

  const dayButton = button("Day", "chip");
  const weekButton = button("Week", "chip");
  dayButton.setAttribute("aria-pressed", "true");
  const spanRow = el("div", "extra");
  spanRow.append(dayButton, weekButton);
  layerBits.get("quakes")!.root.append(spanRow);
  const setSpan = (span: QuakeSpan) => {
    dayButton.setAttribute("aria-pressed", span === "day" ? "true" : "false");
    weekButton.setAttribute("aria-pressed", span === "week" ? "true" : "false");
    handlers.onQuakeSpan(span);
  };
  dayButton.addEventListener("click", () => setSpan("day"));
  weekButton.addEventListener("click", () => setSpan("week"));

  const keyPrompt = button("Add MAP_KEY", "textish");
  keyPrompt.hidden = true;
  layerBits.get("fires")!.root.append(keyPrompt);
  keyPrompt.addEventListener("click", () => openSettings());

  const stations = labeledCheck("Stations", true, (on) => handlers.onSatGroup("stations", on));
  const visual = labeledCheck("Visual", true, (on) => handlers.onSatGroup("visual", on));
  const satRow = el("div", "extra");
  satRow.append(stations.label, visual.label);
  layerBits.get("satellites")!.root.append(satRow);

  const legend = el("div", "legend");
  legend.append(
    swatch("Quakes", "#ffb347"),
    swatch("Fires", "#ff6a2c"),
    swatch("Storms", "#7ec8ff"),
    swatch("ISS", "#ffd27a"),
    swatch("Flights", "#9be7c4"),
  );

  const layers = el("aside", "panel layers");
  layers.append(el("h2", undefined, "Layers"), layerList, legend);

  const detailKicker = el("p", "kicker");
  const detailTitle = el("h2");
  const detailSource = el("p", "source");
  const detailRows = el("div", "facts");
  const detailNote = el("p", "note");
  const close = button("Close", "textish");
  close.addEventListener("click", () => handlers.onCloseDetails());
  const details = el("article", "panel card");
  details.hidden = true;
  details.append(close, detailKicker, detailTitle, detailSource, detailRows, detailNote);

  const labHeading = el("h2");
  const labRows = el("div", "facts");
  const labFormula = el("p", "formula");
  const labNote = el("p", "note");
  const lab = el("article", "panel card");
  lab.hidden = true;
  lab.append(el("p", "kicker", "Lab"), labHeading, labFormula, labRows, labNote);

  const keyInput = document.createElement("input");
  keyInput.type = "password";
  keyInput.autocomplete = "off";
  keyInput.spellcheck = false;
  keyInput.maxLength = 128;
  keyInput.placeholder = "Paste MAP_KEY";
  keyInput.setAttribute("aria-label", "NASA FIRMS MAP_KEY");
  const save = button("Save key", "solid");
  save.type = "submit";
  const clear = button("Clear cached feeds", "textish");
  const settings = el("article", "panel card");
  settings.hidden = true;
  const settingsCopy = el(
    "p",
    "note",
    "The key stays in localStorage on this browser and is sent only to NASA FIRMS. It is never written into the project.",
  );
  const firmsLink = document.createElement("a");
  firmsLink.href = "https://firms.modaps.eosdis.nasa.gov/api/area/";
  firmsLink.target = "_blank";
  firmsLink.rel = "noreferrer";
  firmsLink.textContent = "Get a free MAP_KEY";
  const form = document.createElement("form");
  form.append(keyInput, settingsCopy, firmsLink, save, clear);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    handlers.onSaveKey(keyInput.value);
  });
  settings.append(el("p", "kicker", "Settings"), el("h2", undefined, "NASA FIRMS"), form);
  clear.addEventListener("click", () => handlers.onClearCache());

  const side = el("div", "side");
  side.append(settings, lab, details);

  const play = button("Play", "solid play");
  play.setAttribute("aria-label", "Play or pause");
  const live = button("Live", "ghost");
  const clockLabel = el("div", "clock-readout");
  const clockMain = el("strong");
  const clockSub = el("span");
  clockLabel.append(clockMain, clockSub);
  const timeSlider = document.createElement("input");
  timeSlider.type = "range";
  timeSlider.setAttribute("aria-label", "Simulation time");
  const rateSlider = document.createElement("input");
  rateSlider.type = "range";
  rateSlider.min = "0";
  rateSlider.max = "3";
  rateSlider.step = "0.01";
  rateSlider.value = "0";
  rateSlider.setAttribute("aria-label", "Playback speed");
  const rateReadout = el("span", "rate", "1×");
  const presets = el("div", "presets");
  for (const rate of [1, 10, 100, 1000]) {
    const chip = button(`${rate}×`, "chip");
    chip.addEventListener("click", () => handlers.onRate(rate));
    presets.append(chip);
  }
  const rateRow = el("div", "rate-row");
  rateRow.append(rateReadout, rateSlider, presets);
  const timebar = el("footer", "panel timebar");
  const controls = el("div", "time-controls");
  controls.append(play, live, clockLabel);
  timebar.append(controls, timeSlider, rateRow);

  const toast = el("div", "toast");
  toast.hidden = true;
  let toastTimer = 0;

  root.append(upland, header, layers, side, timebar, toast);

  let scrubbing = false;
  let rating = false;
  timeSlider.addEventListener("pointerdown", () => {
    scrubbing = true;
    handlers.onScrubStart();
  });
  timeSlider.addEventListener("input", () => handlers.onScrub(Number(timeSlider.value)));
  rateSlider.addEventListener("pointerdown", () => {
    rating = true;
  });
  rateSlider.addEventListener("input", () => {
    const rate = Math.min(1000, Math.max(1, 10 ** Number(rateSlider.value)));
    handlers.onRate(rate);
  });
  window.addEventListener("pointerup", () => {
    scrubbing = false;
    rating = false;
  });
  play.addEventListener("click", () => handlers.onPlay());
  live.addEventListener("click", () => handlers.onLive());
  home.addEventListener("click", () => handlers.onHome());
  labButton.addEventListener("click", () => {
    const open = lab.hidden;
    lab.hidden = !open;
    if (open) settings.hidden = true;
    labButton.setAttribute("aria-pressed", open ? "true" : "false");
    settingsButton.setAttribute("aria-pressed", "false");
  });
  settingsButton.addEventListener("click", () => {
    if (settings.hidden) openSettings();
    else closeSettings();
  });
  layersButton.addEventListener("click", () => {
    const open = layers.classList.toggle("open");
    layersButton.setAttribute("aria-expanded", open ? "true" : "false");
  });

  function openSettings(): void {
    settings.hidden = false;
    lab.hidden = true;
    settingsButton.setAttribute("aria-pressed", "true");
    labButton.setAttribute("aria-pressed", "false");
    keyInput.focus();
  }
  function closeSettings(): void {
    settings.hidden = true;
    settingsButton.setAttribute("aria-pressed", "false");
  }

  return {
    setLayer(name, view) {
      const bits = layerBits.get(name);
      if (!bits) return;
      bits.toggle.setAttribute("aria-checked", view.enabled ? "true" : "false");
      bits.count.textContent = view.loading ? "…" : view.enabled ? String(view.count) : "—";
      bits.detail.textContent = view.error ?? view.detail;
      bits.root.classList.toggle("bad", Boolean(view.error));
      bits.retry.hidden = !view.error;
      if (name === "fires") keyPrompt.hidden = !view.promptKey;
    },
    setClock(view) {
      clockMain.textContent = formatClock(view.time);
      clockSub.textContent = view.live ? "Live · Pacific time beside UTC" : "Replay";
      play.textContent = view.playing ? "Pause" : "Play";
      play.setAttribute("aria-pressed", view.playing ? "true" : "false");
      live.setAttribute("aria-pressed", view.live ? "true" : "false");
      if (!scrubbing) {
        timeSlider.min = String(view.min);
        timeSlider.max = String(view.max);
        timeSlider.value = String(view.time);
      }
      if (!rating) rateSlider.value = String(Math.log10(Math.min(1000, Math.max(1, view.rate))));
      rateReadout.textContent = `${Math.round(view.rate)}×`;
      presets.querySelectorAll("button").forEach((chip) => {
        chip.setAttribute("aria-pressed", Number(chip.textContent?.replace("×", "")) === Math.round(view.rate) ? "true" : "false");
      });
    },
    setDetails(model) {
      if (!model) {
        details.hidden = true;
        return;
      }
      details.hidden = false;
      detailKicker.textContent = model.kicker;
      detailTitle.textContent = model.title;
      detailSource.textContent = model.source;
      detailRows.replaceChildren(
        ...model.rows.map((row) => {
          const fact = el("div", "fact");
          fact.append(el("span", undefined, row.label), el("strong", undefined, row.value));
          return fact;
        }),
      );
      detailNote.textContent = model.note ?? "";
      detailNote.hidden = !model.note;
    },
    setLab(model) {
      labHeading.textContent = model.heading;
      labFormula.textContent = model.formula;
      labNote.textContent = model.note;
      labRows.replaceChildren(
        ...model.rows.map((row) => {
          const fact = el("div", "fact");
          fact.append(el("span", undefined, row.label), el("strong", undefined, row.value));
          return fact;
        }),
      );
    },
    setImageryDate(iso) {
      if (document.activeElement === dateInput) return;
      if (dateInput.value !== iso) dateInput.value = iso;
      const today = new Date().toISOString().slice(0, 10);
      dateInput.max = today;
    },
    setKey(key) {
      keyInput.value = key;
    },
    openSettings,
    placeUpland(point) {
      upland.hidden = !point.visible;
      upland.style.left = `${point.x}px`;
      upland.style.top = `${point.y}px`;
    },
    toast(message) {
      toast.hidden = false;
      toast.textContent = message;
      window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toast.hidden = true;
      }, 4200);
    },
  };
}

function makeLayer(name: LayerName, title: string, handlers: UiHandlers, parent: HTMLElement): LayerBits {
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "switch";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-checked", "false");
  toggle.setAttribute("aria-label", title);
  toggle.append(el("i"));
  toggle.addEventListener("click", () => {
    handlers.onToggle(name, toggle.getAttribute("aria-checked") !== "true");
  });
  const detail = el("span", "layer-detail");
  const nameBlock = el("div", "layer-copy");
  nameBlock.append(el("strong", undefined, title), detail);
  const count = el("span", "count", "—");
  const retry = button("Retry", "textish");
  retry.hidden = true;
  retry.addEventListener("click", () => handlers.onRetry(name));
  const root = el("section", "layer");
  root.append(toggle, nameBlock, count, retry);
  parent.append(root);
  return { root, toggle, detail, count, retry };
}

function labeledCheck(text: string, checked: boolean, onChange: (on: boolean) => void): { label: HTMLLabelElement } {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const label = el("label", "check") as HTMLLabelElement;
  label.append(input, document.createTextNode(text));
  return { label };
}

function swatch(text: string, color: string): HTMLElement {
  const item = el("span", "swatch", text);
  item.style.setProperty("--swatch", color);
  return item;
}

function button(text: string, className: string): HTMLButtonElement {
  const node = document.createElement("button");
  node.type = "button";
  node.className = className;
  node.textContent = text;
  return node;
}

function el(tag: string, className?: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function formatClock(ms: number): string {
  const date = new Date(ms);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  const local = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
  return `${day} ${time} UTC · ${local}`;
}
