exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const BOT_TOKEN =
      process.env.TELEGRAM_BOT_TOKEN ||
      "8498494937:AAGJx8ZbG4F6UvlIGckObcgjz1j3XbLFNH4"; // TODO: passe en variable d'env plus tard

    // Liste des destinataires admin
    const ADMIN_CHAT_IDS = [
      "542839510",      // @S_Ottoo (admin)
      "5960037916"      // Shark 🦈
    ];

    const { payload = {}, chatId: customerId = "" } = JSON.parse(event.body || "{}");

    // Construire message admin
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
      L.push(`• ${it.title} ×${it.qty} — ${Number(it.price||0).toFixed(2)}€`);
    });
    L.push("");
    L.push(`💰 *Total*: ${Number(payload.total||0).toFixed(2)}€`);
    if (customerId) L.push(`\n🆔 Client: \`${customerId}\``);
    const adminText = L.join("\n");

    // Inline keyboard pour actions admin
    const inline_keyboard = [[
      { text: "✅ Accepter", callback_data: `ok:${customerId||'-'}` },
      { text: "❌ Refuser",  callback_data: `no:${customerId||'-'}` },
      { text: "✍️ Message",  callback_data: `msg:${customerId||'-'}` }
    ]];

    // Envoi aux admins
    for (const chatId of ADMIN_CHAT_IDS) {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: adminText,
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard }
        })
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        console.error(`Erreur Telegram pour ${chatId}:`, json);
      }
    }

    // Accusé de réception côté client (si mini‑app et donc customerId connu)
    if (customerId) {
      const ack = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({
          chat_id: customerId,
          text: "🧾 Merci ! Ta commande a bien été envoyée. On te répond vite ici 👍",
        })
      });
      await ack.json(); // ignore erreurs client
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return { statusCode: 500, body: String(e) };
  }
};
