import { request } from "./demo.mjs?v=2";

const $ = (id) => document.getElementById(id);
const messages = $("messages");
const input = $("question");
const evidence = $("evidence");
const key = "legal-desk:demo:v1";
let chats;
try { chats = JSON.parse(sessionStorage.getItem(key)) || []; } catch { chats = []; }
let active = chats[0] || null;
let pending = false;
let shown = null;
let selected = null;
let revision = 0;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}
function button(text, className, fn) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", fn);
  return node;
}
function persist() {
  try { sessionStorage.setItem(key, JSON.stringify(chats)); } catch { /* keep current session in memory */ }
}
function renderHistory() {
  $("history").replaceChildren();
  $("clear").disabled = !chats.length;
  if (!chats.length) $("history").append(el("p", "empty", "Здесь появятся ваши диалоги."));
  for (const chat of chats) {
    const node = button(chat.turns[0]?.q || "Новый диалог", "history-item", () => {
      active = chat;
      selectAnswer(active.turns.at(-1)?.a || null);
      render();
      scrollToLatest();
      $("chat-heading").focus({ preventScroll: true });
    });
    node.title = node.textContent;
    if (chat === active) node.setAttribute("aria-current", "true");
    $("history").append(node);
  }
}

const labels = {
  extracts: "Найденные положения", answer: "Ответ по документам", partial: "Частичный ответ",
  insufficient: "Недостаточно данных", clarify: "Нужно уточнение",
  unavailable: "Ответ недоступен", out_of_scope: "Вне базы знаний",
};

function sourcesOf(answer) {
  return answer?.sources.length ? answer.sources : (answer?.matches || []);
}
function selectAnswer(answer, source = null, reveal = false) {
  shown = answer;
  selected = source;
  renderSources(reveal ? source : null);
  if (reveal && !source) {
    $("sources-panel").scrollTop = 0;
    $("sources-heading").focus({ preventScroll: true });
  }
}
function renderSources(focusId = null) {
  const ticket = ++revision;
  const sources = sourcesOf(shown);
  $("count").textContent = sources.length;
  evidence.replaceChildren();
  if (!sources.length) {
    const box = el("div", "source-empty");
    box.append(el("span", "source-icon", "§"), el("b", "", "Пока нет источников"),
      el("p", "", "Здесь появятся документы и положения, которые можно открыть и проверить."));
    evidence.append(box);
    return;
  }
  if (!shown.sources.length) evidence.append(el("p", "source-note", "Выберите источник, чтобы прочитать пункт в контексте."));
  sources.forEach((source, i) => {
    const isOpen = source.id === selected;
    const card = el("article", "source" + (isOpen ? " selected" : ""));
    const open = button("", "source-button", () => {
      selected = isOpen ? null : source.id;
      renderSources(source.id);
    });
    open.setAttribute("aria-expanded", String(isOpen));
    const chevron = el("span", "chevron", isOpen ? "−" : "+");
    chevron.setAttribute("aria-hidden", "true");
    open.append(el("span", "num", String(i + 1)), el("span", "source-name", source.title), chevron);
    const meta = [source.provision || "строка " + source.line,
      source.version && "Редакция: " + source.version].filter(Boolean).join(" · ");
    card.append(open, el("div", "source-meta", meta));
    if (!isOpen) {
      card.append(el("p", "excerpt", source.text));
    } else {
      const reader = el("div", "reader");
      card.append(reader);
      reader.append(el("div", "eyebrow", "ТЕКСТ ДОКУМЕНТА"), el("p", "", "Загрузка…"));
      request("/api/document/" + encodeURIComponent(source.doc_id))
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(doc => {
          if (ticket !== revision) return;
          reader.replaceChildren(el("div", "eyebrow", "ТЕКСТ ДОКУМЕНТА"));
          const body = el("div", "document");
          let current;
          doc.chunks.forEach(chunk => {
            const isCurrent = chunk.id === source.id;
            const p = el("p", isCurrent ? "current" : "");
            p.append(el("span", "", (isCurrent ? "Выбранный пункт · " : "") + chunk.provision),
              document.createTextNode(chunk.text));
            if (isCurrent) current = p;
            body.append(p);
          });
          reader.append(body);
          if (current) body.scrollTop = current.offsetTop;
        })
        .catch(() => { if (ticket === revision) reader.replaceChildren(el("p", "", "Не удалось открыть документ.")); });
    }
    evidence.append(card);
    if (source.id === focusId) {
      requestAnimationFrame(() => {
        if (ticket !== revision) return;
        open.focus({ preventScroll: true });
        card.scrollIntoView({ block: "nearest", inline: "nearest" });
      });
    }
  });
}

function copyText(answer) {
  const sources = sourcesOf(answer);
  return [...answer.claims.map(c => c.text + " " + c.source_ids.map(
    id => "[" + (sources.findIndex(s => s.id === id) + 1) + "]").join(" ")),
    answer.note, ...sources.map((s, i) => "[" + (i + 1) + "] " + s.title + ", " +
      (s.provision || "строка " + s.line) + (answer.claims.length ? "" : ": " + s.text))].filter(Boolean).join("\n");
}

function render() {
  renderHistory();
  $("welcome").hidden = Boolean(active?.turns.length);
  messages.replaceChildren();
  for (const turn of active?.turns || []) {
    const group = el("div", "turn");
    group.append(el("div", "question-bubble", turn.q));
    messages.append(group);
    const a = turn.a;
    if (!a) { group.append(el("div", "loading", "Ищу положения в базе…")); continue; }
    const card = el("article", "answer");
    const status = el("div", "status-chip", labels[a.status] || "Результат");
    status.dataset.status = a.status;
    card.append(status);
    const sources = sourcesOf(a);
    const cite = (id) => {
      const number = sources.findIndex(s => s.id === id) + 1;
      const b = button(String(number), "cite", () => selectAnswer(a, id, true));
      b.setAttribute("aria-label", "Открыть источник " + number);
      return b;
    };
    for (const claim of a.claims) {
      const p = el("p", "", claim.text + " ");
      claim.source_ids.forEach(id => p.append(cite(id)));
      card.append(p);
    }
    if (a.note) card.append(el("p", "note", a.note));
    if (a.status === "extracts" || a.status === "unavailable") {
      a.matches.slice(0, 3).forEach(s => {
        const p = el("p", "match", s.text + " ");
        p.append(cite(s.id));
        card.append(p);
      });
    }
    const actions = el("div", "actions");
    if (sources.length) actions.append(button("Показать источники · " + sources.length, "quiet", () => selectAnswer(a, null, true)));
    const copy = button("Копировать", "quiet", async () => {
      try { await navigator.clipboard.writeText(copyText(a)); copy.textContent = "Скопировано"; }
      catch { copy.textContent = "Не удалось скопировать"; }
    });
    actions.append(copy);
    card.append(actions);
    group.append(card);
  }
  $("submit").disabled = pending || !input.value.trim();
}

function scrollToLatest() {
  messages.lastElementChild?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

$("new").addEventListener("click", () => {
  active = null;
  input.value = "";
  selectAnswer(null);
  render();
  $("thread").scrollTop = 0;
  input.focus();
});
$("clear").addEventListener("click", () => {
  chats = [];
  active = null;
  persist();
  selectAnswer(null);
  render();
  $("new").focus();
});
input.addEventListener("input", () => { $("submit").disabled = pending || !input.value.trim(); });
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    $("composer").requestSubmit();
  }
});
document.querySelectorAll("[data-example]").forEach(b => b.addEventListener("click", () => {
  input.value = b.dataset.example;
  $("composer").requestSubmit();
}));

$("composer").addEventListener("submit", async e => {
  e.preventDefault();
  const q = input.value.trim();
  if (!q || pending) return;
  const chat = active || {turns: []};
  if (!active) chats.unshift(chat);
  active = chat;
  const history = chat.turns.map(t => t.q);
  const turn = {q, a: null};
  chat.turns.push(turn);
  pending = true;
  $("chat-status").textContent = "Ищу положения в базе.";
  input.value = "";
  render();
  scrollToLatest();
  try {
    const response = await request("/api/ask", {method: "POST", headers: {"Content-Type": "application/json"},
      body: JSON.stringify({question: q, history})});
    const body = await response.json();
    if (!response.ok) throw new Error(body.error);
    turn.a = body;
  } catch {
    turn.a = {status: "unavailable", claims: [], sources: [], matches: [],
      note: "Не удалось обработать вопрос. Попробуйте отправить его ещё раз."};
  } finally {
    pending = false;
    persist();
    render();
    if (chat === active) {
      selectAnswer(turn.a);
      $("chat-status").textContent = labels[turn.a.status] || "Результат готов.";
      scrollToLatest();
    }
  }
});

request("/api/info").then(r => r.json()).then(info => {
  $("mode").textContent = info.documents + " учебных документа";
}).catch(() => { $("mode").textContent = "База недоступна"; });
selectAnswer(active?.turns.at(-1)?.a || null);
render();

