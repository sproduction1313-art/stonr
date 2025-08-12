const btn = document.getElementById('send-btn');
const fields = ['name', 'phone', 'address'];

fields.forEach(id => {
  document.getElementById(id).addEventListener('input', checkForm);
});

function checkForm() {
  const allFilled = fields.every(id => document.getElementById(id).value.trim() !== "");
  btn.disabled = !allFilled;
}

btn.addEventListener('click', () => {
  const name = document.getElementById('name').value;
  const phone = document.getElementById('phone').value;
  const address = document.getElementById('address').value;
  const note = document.getElementById('note').value;

  const orderDetails = `📦 Nouvelle commande :
👤 Nom: ${name}
📞 Téléphone: ${phone}
📍 Adresse: ${address}
📝 Note: ${note}`;

  // ⚠️ Mets ton vrai token et chat_id ici
  const token = "TON_TOKEN_BOT";
  const chatId = "TON_CHAT_ID";
  fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: orderDetails })
  })
  .then(res => res.json())
  .then(data => alert("Commande envoyée ✅"))
  .catch(err => alert("Erreur lors de l'envoi ❌"));
});
