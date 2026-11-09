// All four documents are fictional and written for this shared demonstration.
const documents = [
  {
    id: "lease", title: "Учебный договор аренды № Д-14", aliases: /д-14|демо.склад|аренд/,
    clauses: [
      ["1.1", "Демо Склад передаёт арендатору складское помещение."],
      ["3.1", "Арендная плата составляет 420 000 рублей за месяц."],
      ["3.2", "Арендатор вносит арендную плату не позднее 7-го числа текущего месяца."],
      ["4.1", "Арендатор и его транспорт имеют круглосуточный доступ к складу."],
      ["6.1", "При возврате склада стороны подписывают акт приёма-передачи."],
    ],
  },
  {
    id: "policy-2023", title: "Учебный регламент согласования договоров", version: "2023",
    clauses: [
      ["1.1", "Эта редакция действует с 1 января 2023 года до 1 марта 2025 года."],
      ["2.4", "Для договора на сумму свыше 10 млн рублей требуется предварительное одобрение генерального директора."],
      ["3.2", "Инициатор передаёт оригинал договора в юридический отдел за три рабочих дня после подписания."],
    ],
  },
  {
    id: "policy-2025", title: "Учебный регламент согласования договоров", version: "2025",
    clauses: [
      ["1.1", "Эта редакция действует с 1 марта 2025 года."],
      ["2.4", "Для договора на сумму свыше 15 млн рублей требуется предварительное одобрение генерального директора."],
      ["3.2", "Инициатор передаёт оригинал договора в юридический отдел за два рабочих дня после подписания."],
    ],
  },
  {
    id: "supply", title: "Учебный договор поставки № Д-23", aliases: /д-23|поставк|поставщик/,
    clauses: [
      ["1.1", "Поставщик передаёт покупателю оборудование по спецификации."],
      ["4.1", "Покупатель проверяет комплектность и качество оборудования в течение пяти рабочих дней после поставки."],
      ["5.1", "Гарантийный срок на оборудование составляет 12 месяцев с даты подписания накладной."],
    ],
  },
].map(doc => ({
  ...doc, chunks: doc.clauses.map(([provision, text], index) => ({
    id: doc.id + "-" + provision, doc_id: doc.id, title: doc.title,
    version: doc.version || "", provision: "п. " + provision, line: index + 1, text,
  })),
}));

const ignored = new Set("а и в до от на по с за из для как какая какие какой что чем кто где у нужно надо можно сколько договор договора договору срок числа рублей млн".split(" "));
const normalize = text => text.toLowerCase().replaceAll("ё", "е");
function terms(text) {
  return new Set((normalize(text).match(/[а-я]+/g) || [])
    .filter(word => word.length >= 4 && !ignored.has(word))
    .map(word => word.length > 5 ? word.slice(0, 5) : word));
}

function findAnswer(question, history) {
  const query = normalize(question);
  const scope = documents.find(doc => doc.aliases?.test(query)) ||
    [...history].reverse().map(turn => documents.find(doc => doc.aliases?.test(normalize(turn)))).find(Boolean);
  const dateQuery = [query, ...[...history].reverse()].find(turn => /20\d{2}/.test(turn)) || "";
  const year = Number(dateQuery.match(/20\d{2}/)?.[0] || 2025);
  const early2025 = year === 2025 && /январ|феврал|\b\d{1,2}[./]0?[12][./]2025\b/i.test(dateQuery);
  const version = year < 2025 || early2025 ? "2023" : "2025";
  const intent = terms(query.replace(/(?:ооо\s+)?[«"]?демо[ -]склад[»"]?/g, " "));
  const queryTerms = intent.size ? intent : terms(query);
  const candidates = documents
    .filter(doc => !doc.version || doc.version === version)
    .filter(doc => !scope || !doc.aliases || doc.id === scope.id)
    .flatMap(doc => doc.chunks.map(chunk => {
      const hits = [...terms(chunk.text)].filter(term => queryTerms.has(term)).length;
      return { chunk, score: hits * (doc.id === scope?.id ? 1.4 : 1) };
    }))
    .filter(candidate => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4).map(candidate => candidate.chunk);
  return {
    status: candidates.length ? "extracts" : "insufficient", claims: [], sources: [], matches: candidates,
    note: candidates.length ? "В учебной базе найдены эти пункты. Сверьте их с вашим вопросом." :
      "В учебной базе не нашлось положения, которое отвечает на этот вопрос.",
  };
}

export async function request(path, options = {}) {
  if (path === "/api/info") return Response.json({ documents: documents.length });
  if (path.startsWith("/api/document/")) {
    const doc = documents.find(item => path === "/api/document/" + item.id);
    if (doc) return Response.json({ title: doc.title, version: doc.version || "", chunks: doc.chunks });
  }
  if (path === "/api/ask" && options.method === "POST") {
    const { question, history = [] } = JSON.parse(options.body);
    if (typeof question === "string" && question.trim() && question.length <= 9000 && Array.isArray(history)) {
      return Response.json(findAnswer(question, history.filter(turn => typeof turn === "string").slice(-6)));
    }
    return Response.json({ error: "Введите вопрос (до 9000 символов)." }, { status: 400 });
  }
  return Response.json({ error: "Не найдено." }, { status: 404 });
}
