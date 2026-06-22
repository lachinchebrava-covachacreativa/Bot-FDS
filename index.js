('express');
const { crearCita, verificarDisponibilidad } = require('./calendar');
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
const SYSTEM_PROMPT = `Eres Adri, la asistente virtual de Fábrica de Sonrisas, una clínica dental.
 
TONO: Amable, cordial, cálido y mexicano. Cercano pero profesional. Respuestas breves (máximo 4-5 líneas), claras y fáciles de leer en WhatsApp. Puedes usar emojis con moderación (🦷😊) pero sin exagerar.
 
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
 
AGENDAR CITAS:
Por el momento SOLO agendamos citas de VALORACIÓN DE PRIMERA VEZ, y únicamente para estos dos tratamientos:
- Implantes dentales
- Ortodoncia (brackets)
 
HORARIOS PARA VALORACIONES DE PRIMERA VEZ (distintos a los horarios generales de la clínica):
- Lunes a viernes de 10:00 a 19:00 horas
- Sábados de 10:00 a 14:00 horas
Nunca ofrezcas ni agendes una valoración fuera de este horario, aunque el paciente lo pida.
 
Si el paciente pide agendar cualquier otro tipo de cita (limpieza, blanqueamiento, revisión de tratamiento en curso, urgencias, etc.), NO la agendes. En su lugar, dile amablemente que por ahora solo agendamos valoraciones de primera vez para implantes y ortodoncia, y ofrece conectarlo con el equipo: "Por ahora solo puedo agendar valoraciones de primera vez para implantes dentales u ortodoncia. Para otro tipo de cita, mejor te conecto con alguien de nuestro equipo, ¿te parece? 😊"
 
Si el paciente pide una valoración de implantes u ortodoncia (y es su primera vez, no un seguimiento):
1. Pregunta su nombre completo (si no lo sabes ya).
2. Confirma cuál de los dos tratamientos le interesa: implantes u ortodoncia.
3. Pregunta qué día y hora prefiere, dentro del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00). Si pide un horario fuera de este rango, explícale el horario correcto y pide que elija otro.
4. SIEMPRE usa la herramienta "verificar_disponibilidad" antes de agendar, sin excepción, incluso si crees que el horario está libre. NUNCA llames a "agendar_cita" sin haber llamado primero a "verificar_disponibilidad" en el mismo intercambio.
5. Si la herramienta confirma que está disponible, usa "agendar_cita" para crearla (el motivo debe ser "Valoración de implantes" o "Valoración de ortodoncia"), y confirma al paciente con un mensaje cálido incluyendo fecha y hora.
6. Si NO está disponible, dile amablemente que ese horario ya está ocupado y pide que elija otro. No intentes agendar igual.
- Siempre usa el año 2026 si el paciente no especifica año.
- Nunca agendes fuera del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00).
- Nunca agendes algo que no sea una valoración de primera vez de implantes u ortodoncia.
- Nunca agendes dos citas en el mismo horario; siempre confía en el resultado de "verificar_disponibilidad".
- Nunca agendes algo que no sea una valoración de primera vez de implantes u ortodoncia.
 
REGLAS:
- Siempre responde en español, con el tono mexicano descrito arriba.
- Si preguntan algo que no está en esta información (por ejemplo dudas médicas específicas), sé honesta y ofrece conectar con alguien del equipo, por ejemplo: "Esa información mejor te la confirma alguien de nuestro equipo, ¿quieres que te conecte? 😊"
- Nunca inventes precios, servicios o promociones que no estén aquí.`;
 
// ===========================================
// DEFINICIÓN DE HERRAMIENTAS (TOOLS) PARA CLAUDE
// ===========================================
const TOOLS = [
  {
    name: 'verificar_disponibilidad',
    description: 'Verifica si un horario específico está disponible en el calendario de citas antes de agendar.',
    input_schema: {
      type: 'object',
      properties: {
        fechaHoraInicio: { type: 'string', description: 'Fecha y hora de inicio en formato ISO, ej: 2026-06-25T10:00:00' },
        fechaHoraFin: { type: 'string', description: 'Fecha y hora de fin en formato ISO, ej: 2026-06-25T11:00:00 (asume 1 hora de duración si no se especifica)' },
      },
      required: ['fechaHoraInicio', 'fechaHoraFin'],
    },
  },
  {
    name: 'agendar_cita',
    description: 'Crea una cita de VALORACIÓN DE PRIMERA VEZ en el calendario, solo para implantes dentales u ortodoncia, una vez confirmada la disponibilidad y todos los datos del paciente.',
    input_schema: {
      type: 'object',
      properties: {
        paciente: { type: 'string', description: 'Nombre completo del paciente' },
        telefono: { type: 'string', description: 'Número de teléfono del paciente' },
        motivo: { type: 'string', description: 'Debe ser exactamente "Valoración de implantes" o "Valoración de ortodoncia"' },
        fechaHoraInicio: { type: 'string', description: 'Fecha y hora de inicio en formato ISO' },
        fechaHoraFin: { type: 'string', description: 'Fecha y hora de fin en formato ISO' },
      },
      required: ['paciente', 'telefono', 'motivo', 'fechaHoraInicio', 'fechaHoraFin'],
    },
  },
];
 
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
    const lower = userText.toLowerCase().trim();
    if (lower === 'humano' || lower === 'agente') {
      await sendWhatsAppMessage(from, 'Te voy a conectar con una persona de nuestro equipo, en breve te contactan 🙌');
      return;
    }
 
    // Mantener historial corto por usuario (últimos 6 mensajes)
    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: 'user', content: userText });
    conversationHistory[from] = conversationHistory[from].slice(-6);
 
    const claudeReply = await askClaude(conversationHistory[from], from);
 
    conversationHistory[from].push({ role: 'assistant', content: claudeReply });
 
    await sendWhatsAppMessage(from, claudeReply);
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
});
 
// ============ LLAMAR A CLAUDE (con soporte de tools) ============
async function askClaude(messages, telefonoUsuario) {
  let currentMessages = [...messages];
 
  // Loop para permitir que Claude use herramientas y luego responda con el resultado
  for (let i = 0; i < 4; i++) { // límite de 4 vueltas por seguridad
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: currentMessages,
        tools: TOOLS,
      }),
    });
 
    const data = await response.json();
 
    if (data.error) {
      console.error('Error de Claude API:', data.error);
      return 'Disculpa, tuve un problema técnico. ¿Puedes intentar de nuevo en un momento?';
    }
 
    // Si Claude quiere usar una herramienta
    if (data.stop_reason === 'tool_use') {
      const toolUseBlock = data.content.find((b) => b.type === 'tool_use');
      const toolResult = await ejecutarHerramienta(toolUseBlock, telefonoUsuario);
 
      // Agregamos la respuesta de Claude (con la solicitud de tool) y el resultado al historial de ESTA llamada
      currentMessages.push({ role: 'assistant', content: data.content });
      currentMessages.push({
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUseBlock.id,
            content: JSON.stringify(toolResult),
          },
        ],
      });
      continue; // volvemos a llamar a Claude con el resultado de la herramienta
    }
 
    // Respuesta final de texto
    const textBlock = data.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : 'Disculpa, no entendí bien tu mensaje. ¿Puedes repetirlo?';
  }
 
  return 'Disculpa, tuve un problema procesando tu solicitud. ¿Puedes intentar de nuevo?';
}
 
// ============ EJECUTAR HERRAMIENTAS ============
async function ejecutarHerramienta(toolUseBlock, telefonoUsuario) {
  const { name, input } = toolUseBlock;
 
  try {
    if (name === 'verificar_disponibilidad') {
      const disponible = await verificarDisponibilidad(input.fechaHoraInicio, input.fechaHoraFin);
      return { disponible };
    }
 
    if (name === 'agendar_cita') {
      const evento = await crearCita({
        paciente: input.paciente,
        telefono: input.telefono || telefonoUsuario,
        motivo: input.motivo,
        fechaHoraInicio: input.fechaHoraInicio,
        fechaHoraFin: input.fechaHoraFin,
      });
 
      if (evento.ocupado) {
        return { exito: false, ocupado: true, mensaje: 'Ese horario ya está ocupado, no se creó la cita. Pide al paciente otro horario.' };
      }
 
      return { exito: true, eventoId: evento.id };
    }
 
    return { error: 'Herramienta no reconocida' };
  } catch (err) {
    console.error(`Error ejecutando herramienta ${name}:`, err);
    return { error: 'No se pudo completar la acción en el calendario' };
  }
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
 
