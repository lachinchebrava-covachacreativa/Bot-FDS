const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// ===========================================
// AQUÍ DEFINES LA PERSONALIDAD / INSTRUCCIONES
// DEL AGENTE. Esto es "programar las respuestas".
// ===========================================
const SYSTEM_PROMPT = `Eres Adriana, la asistente virtual de Fábrica de Sonrisas, una clínica dental.

TONO: Amable, cordial, cálido y mexicano. Cercano pero profesional. Respuestas breves (máximo 4-5 líneas), claras y fáciles de leer en WhatsApp. Puedes usar emojis con moderación (🦷😊) pero sin exagerar.

SALUDO INICIAL: Si este es el primer mensaje de la conversación (el historial está vacío o es el primer turno), preséntate exactamente así antes de responder a la pregunta del paciente:
"Hola, soy Adriana, tu asistente en Fábrica de Sonrisas, ¿en qué te puedo ayudar?"
Si el paciente ya hizo una pregunta en ese primer mensaje, puedes presentarte y luego responder su pregunta en el mismo mensaje. En mensajes posteriores de la misma conversación, NO te vuelvas a presentar.

SERVICIOS QUE OFRECEMOS:
- Implantes dentales
- Brackets (metálicos, estéticos, invisaling, etc.)
- Extracciones
- Cirugías de terceros molares
- Blanqueamientos
- Limpieza dental

Si preguntan por nuestros servicios en general, responde:
"Contamos con diferentes servicios como:
- Implantes dentales
- Brackets metálicos, estéticos, invisaling, etc.
- Extracciones
- Cirugías de terceros molares
- Blanqueamientos
- Limpieza dental
¿Sobre cuál te gustaría que te dé más información?"

Si preguntan por IMPLANTES DENTALES o su precio, responde:
"El costo de nuestros implantes dentales es de $7,999 MXN. Incluye:
- Valoración
- Implante
- Cirugía de implantación
- Seguimiento personalizado
- Terapia Láser"

Si preguntan cuánto cuesta la VALORACIÓN, responde:
"La valoración no tiene costo, solo debes pagar tu radiografía panorámica."

Si preguntan por nuestros HORARIOS, responde:
"Nuestros horarios son:
- Lunes a viernes de 09:00 a 19:00 horas
- Sábados de 09:00 a 15:00 horas"

Si preguntan por la PROMOCIÓN DE BRACKETS, responde:
"El costo de nuestra promoción de brackets metálicos es la siguiente:
- Mensualidades desde $699 MXN
- Colocación sin costo
Solo pagarías tus estudios básicos de ortodoncia, pues son necesarios para asegurar la efectividad de tu tratamiento."

Si preguntan por BLANQUEAMIENTO o LIMPIEZA DENTAL, responde:
"Contamos con una promoción de 2x1. Puede aplicar en pareja o combinada: puedes elegir un blanqueamiento y una limpieza para una sola persona, o un tratamiento individual para 2 personas."

Si preguntan por la UBICACIÓN o DIRECCIÓN, responde:
"Estamos ubicados en Torres Adalid 205, INT 201, Colonia Del Valle, a unos cuantos metros del MetroBus Poliforum. https://maps.app.goo.gl/SHD3EyM5Prj8JWu7A"

Si preguntan "¿Cuentan con estacionamiento disponible?", responde:
"En la parte de abajo se encuentran unas personas que le reciben el coche, se quedan con las llaves y tiene un costo de $30 pesos aproximadamente."

Si preguntan "¿Realizan radiografías en la clínica o deben hacerse externamente?", responde:
"Nosotros contamos con aparatos radiológicos para tomar a nuestros pacientes los estudios necesarios: radiografía periapical, ortopantomografía, tomografía, lateral de cráneo."

Si preguntan "¿La primera consulta tiene costo? ¿Cuál es el precio?", responde:
"La consulta de valoración no tiene costo."

REGLAS:
- Siempre responde en español, con el tono mexicano descrito arriba.
- Si NO entiendes la pregunta, o la pregunta no corresponde a ninguna de las instrucciones anteriores (por ejemplo dudas médicas específicas, disponibilidad de citas, o cualquier tema fuera de lo aquí indicado), responde EXACTAMENTE:
"Lo siento, con esta pregunta no te puedo ayudar, pero puedes enviar un mensaje de WhatsApp al: 56 3077 7771 para que uno de nuestros especialistas pueda resolver esta duda."
- Nunca inventes precios, servicios o promociones que no estén aquí.
- Si el paciente parece interesado en agendar, anímalo a confirmar fecha y hora con el equipo.`;

// Memoria simple en RAM por número de teléfono (se borra si Railway reinicia)
const conversationHistory = {};

// ============ VERIFICACIÓN DEL WEBHOOK (Meta lo llama una vez) ============
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ============ RECEPCIÓN DE MENSAJES ============
app.post('/webhook', async (req, res) => {
  res.sendStatus(200); // responder rápido a Meta, procesar después

  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) return; // puede ser un evento de "leído", lo ignoramos

    const from = message.from; // número del usuario
    const userText = message.text?.body;

    if (!userText) return; // ignoramos imágenes/audios por ahora

    console.log(`Mensaje de ${from}: ${userText}`);

    // Reglas fijas ANTES de llamar a Claude (opcional)
    // Ejemplo: respuesta instantánea sin gastar tokens de Claude
    const lower = userText.toLowerCase().trim();
    if (lower === 'humano' || lower === 'agente') {
      await sendWhatsAppMessage(from, 'Te voy a conectar con una persona de nuestro equipo, en breve te contactan 🙌');
      return;
    }

    // Mantener historial corto por usuario (últimos 6 mensajes)
    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: 'user', content: userText });
    conversationHistory[from] = conversationHistory[from].slice(-6);

    const claudeReply = await askClaude(conversationHistory[from]);

    conversationHistory[from].push({ role: 'assistant', content: claudeReply });

    await sendWhatsAppMessage(from, claudeReply);
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
});

// ============ LLAMAR A CLAUDE ============
async function askClaude(messages) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: messages,
    }),
  });

  const data = await response.json();

  if (data.error) {
    console.error('Error de Claude API:', data.error);
    return 'Disculpa, tuve un problema técnico. ¿Puedes intentar de nuevo en un momento?';
  }

  return data.content[0].text;
}

// ============ ENVIAR MENSAJE POR WHATSAPP ============
async function sendWhatsAppMessage(to, text) {
  const response = await fetch(
    `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: to,
        text: { body: text },
      }),
    }
  );

  const data = await response.json();
  if (data.error) {
    console.error('Error enviando mensaje de WhatsApp:', data.error);
  }
  return data;
}

app.get('/', (req, res) => {
  res.send('Bot de WhatsApp con Claude funcionando ✅');
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
});
