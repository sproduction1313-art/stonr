// netlify/functions/tgWebhook.js
exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    const BOT_TOKEN =
      process.env.TELEGRAM_BOT_TOKEN ||
      "8498494937:AAGJx8ZbG4F6UvlIGckObcgjz1j3XbLFNH4";

    const update = JSON.parse(event.body || "{}");

    // 1) Boutons (callback_query)
    if (update.callback_query) {
      const cq = update.callback_query;
      const fromId = cq.from.id;
      const data = String(cq.data || "");
      const [action, rawId] = data.split(":");
      const customerId = rawId && rawId !== "-" ? rawId : "";

      // Accusé de clic
      await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type":"application/json" },
        body: JSON.stringify({ callback_query_id: cq.id })
      });

      if (!customerId) {
        // Pas d'ID client connu
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: fromId, text: "ℹ️ Cette commande n'a pas d'ID Telegram client (commande hors mini‑app)." })
        });
        return { statusCode: 200, body: "ok" };
      }

      if (action === "ok") {
        // Accepter
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({
            chat_id: customerId,
            text: "✅ Ta commande est acceptée. On prépare ça et on te tient au courant !"
          })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: fromId, text: "✅ Message d’acceptation envoyé au client." })
        });
      } else if (action === "no") {
        // Refuser
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({
            chat_id: customerId,
            text: "❌ Désolé, nous ne pouvons pas accepter cette commande. N’hésite pas à réessayer plus tard."
          })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: fromId, text: "❌ Message de refus envoyé au client." })
        });
      } else if (action === "msg") {
        // Demander un message perso (force_reply)
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({
            chat_id: fromId,
            text: `✍️ Écris le message à envoyer au client.\n(Réponds à ce message) #${customerId}`,
            reply_markup: { force_reply: true }
          })
        });
      }
      return { statusCode: 200, body: "ok" };
    }

    // 2) Réponse de l’admin à "force_reply" → transférer au client
    if (update.message && update.message.reply_to_message) {
      const msg = update.message;
      const fromId = msg.from.id;
      const text = (msg.text || "").trim();
      const replied = msg.reply_to_message;
      const marker = (replied.text || "").match(/#(\d{4,})/); // on a mis #<customerId>
      const customerId = marker ? marker[1] : "";

      if (customerId && text) {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: customerId, text })
        });
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: fromId, text: "📨 Message transmis au client." })
        });
      } else {
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type":"application/json" },
          body: JSON.stringify({ chat_id: fromId, text: "❗Impossible d’identifier le client ou message vide." })
        });
      }
      return { statusCode: 200, body: "ok" };
    }

    return { statusCode: 200, body: "noop" };
  } catch (e) {
    return { statusCode: 200, body: "ok" }; // toujours 200 pour Telegram
  }
};
