// netlify/functions/sendOrder.js
// Node 18+ sur Netlify : fetch est dispo nativement

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    // ⚠️ Utilise d'abord les variables d'env si présentes (meilleure sécurité),
    // sinon fallback sur tes valeurs pour que ça marche "juste en copiant-collant".
    const BOT_TOKEN =
      process.env.TELEGRAM_BOT_TOKEN ||
      "8498494937:AAGJx8ZbG4F6UvlIGckObcgjz1j3XbLFNH4";

    const DEFAULT_CHAT_ID =
      process.env.TELEGRAM_CHAT_ID || "542839510"; // @S_Ottoo

    if (!BOT_TOKEN) {
      return { statusCode: 500, body: "Missing TELEGRAM_BOT_TOKEN" };
    }

    const body = JSON.parse(event.body || "{}");
    const payload = body.payload || {};

    // chat_id prioritaire = fourni par le front (si la mini‑app est ouverte dans Telegram)
    const chatId =
      body.chatId ||
      body.userId ||
      (payload.customer && payload.customer.chatId) ||
      DEFAULT_CHAT_ID;

    if (!chatId) {
      return {
        statusCode: 400,
        body:
          "chat_id manquant. Ouvre la mini‑app depuis Telegram ou configure TELEGRAM_CHAT_ID.",
      };
    }

    // Construire le message
    const L = [];
    L.push("📦 *Nouvelle commande*");
    L.push("");
    L.push(`👤 *Nom*: ${payload?.customer?.name || "-"}`);
    L.push(`📞 *Tel*: ${payload?.customer?.phone || "-"}`);
    L.push(`🏠 *Adresse*: ${payload?.customer?.address || "-"}`);
    if (payload?.customer?.note) L.push(`📝 *Note*: ${payload.customer.note}`);
    L.push("");
    L.push("*Produits:*");
    (payload.items || []).forEach((it) => {
      const p = Number(it.price || 0);
      L.push(`• ${it.title} ×${it.qty} — ${p.toFixed(2)}€`);
    });
    L.push("");
    L.push(`💰 *Total*: ${Number(payload.total || 0).toFixed(2)}€`);

    const text = L.join("\n");

    // Envoi Telegram
    const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "Markdown",
      }),
    });
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      return {
        statusCode: 502,
        body: `Telegram error: ${resp.status} ${JSON.stringify(data)}`,
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
