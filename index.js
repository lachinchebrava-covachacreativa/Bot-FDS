const express = require('express');
const { crearCita, verificarDisponibilidad, cancelarEventoCalendar, buscarEventoCalendar, reagendarEventoCalendar } = require('./calendar');
const {
  inicializarDB, guardarMensaje, obtenerTodosLosMensajes, guardarCita,
  obtenerCitaPorTelefono, cancelarCitaDB, reagendarCitaDB,
  marcarEsperandoHumano, quitarEsperandoHumano, estaEsperandoHumano,
} = require('./db');
const { procesarRecordatorios } = require('./recordatorios');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// Número de WhatsApp del equipo (sin "+", con lada de país, ej. 5215512345678).
// A este número se le avisa cada vez que un paciente necesita atención
// humana. Configurable por variable de entorno; si no está definida usa el
// mismo número que ya se daba para urgencias dentales.
const NUMERO_EQUIPO = process.env.NUMERO_EQUIPO_WHATSAPP || '5630777771';
 
const SYSTEM_PROMPT_BASE = `Eres Adri, la asistente virtual de Fábrica de Sonrisas, una clínica dental.
 
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
"El tratamiento tiene un costo de $7,999 incluye:
- Implante dental (por diente)
- Corona (resina)
- Seguimiento
- Cirugía de implantación"
 
Si preguntan si la CITA DE VALORACIÓN tiene costo, responde:
"Nuestra cita de valoración NO TIENE COSTO."
 
Si preguntan si EL TRATAMIENTO DUELE, responde:
"El tratamiento se realiza mediante sedación, así que no, no duele."
 
Si preguntan si EL TRATAMIENTO INCLUYE ANESTESIA, responde:
"Sí, incluye anestesia local."
 
Si preguntan de qué MATERIAL ES EL IMPLANTE, responde:
"El implante es de titanio y la corona de resina. También contamos con otras opciones en materiales para corona como zirconio."
 
Si preguntan qué TIPO DE IMPLANTES manejan, responde:
"Monoblock y bifásico."
 
Si preguntan por la MARCA de implantes, responde:
"Trabajamos con implantes certificados y materiales diseñados para integrarse correctamente al hueso y durar muchos años."
 
Si preguntan si trabajan con MATERIALES CERTIFICADOS, responde:
"Sí. Trabajamos con materiales certificados y con la más alta tecnología."
 
Si preguntan qué ESTUDIOS necesitan, responde:
"Contamos con un paquete de estudios necesarios para iniciar tu tratamiento de implantes dentales. Incluye: tomografía, radiografía panorámica y escaneo."
 
Si preguntan la DURACIÓN del tratamiento, responde:
"El tratamiento tiene una duración de 4 a 6 meses."
 
Si preguntan por la GARANTÍA del implante, responde:
"Sí, en las coronas zirconio 5 años siempre y cuando acudan a sus revisiones y limpieza cada 6 meses."
 
Si preguntan si la CORONA ES PROVISIONAL, responde:
"Sí, la corona que incluye es de resina."
 
Si preguntan CUÁL DE LOS DOS MATERIALES ES MEJOR (resina/PMMA vs zirconio), responde:
"Los dos son buenos, depende del cuidado del paciente. La corona de PMMA es de plástico resistente y la corona de zirconio es de un mineral. Pero sí, el cuidado del paciente es fundamental."
 
Si preguntan qué NO INCLUYE el tratamiento, responde:
"No incluye:
- Extracción
- Estudios
- Regeneración ósea
- Y otros tratamientos"
 
Si preguntan por FORMAS DE PAGO, responde:
"Contamos con 3, 6 y 9 Meses Sin Intereses pagando con tarjeta de crédito."
 
Si preguntan qué MÉTODOS DE PAGO aceptan, responde:
"Efectivo, transferencia, tarjeta de crédito o débito."
 
Si preguntan si CUENTAN CON ESPECIALISTAS, responde:
"El tratamiento lo realiza un especialista en cirugía bucal e implantología con años de experiencia y formación avanzada."
 
Si preguntan por URGENCIAS DENTALES, responde:
"Sí, para una urgencia dental comunícate a 5630777771."
 
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
 
IMPORTANTE sobre horarios: Cuando el paciente diga una hora, sigue estas reglas:
- Si dice "1", "2", "3", "4", "5", "6", "7" (sin AM/PM ni "de la mañana") → interpreta siempre como tarde: 13:00, 14:00, 15:00, 16:00, 17:00, 18:00, 19:00.
- Si dice "10", "11", "12" → interpreta como mañana: 10:00, 11:00, 12:00.
- Si dice "8" o "9" → pregunta amablemente "¿Sería a las 8 de la mañana o de la tarde?" antes de proceder.
- Si dice "de la mañana" o "AM" → usa la hora exacta que dijo.
- Si dice "de la tarde" o "PM" → convierte a formato 24 horas (ej. 3 de la tarde = 15:00).
- Nunca interpretes ninguna hora como madrugada a menos que el paciente lo diga explícitamente.
- Siempre confirma la hora en el resumen antes de agendar (ej. "a las 14:00 hrs").
 
Si el paciente pide agendar cualquier otro tipo de cita (limpieza, blanqueamiento, revisión de tratamiento en curso, urgencias, etc.), NO la agendes. En su lugar, dile amablemente que por ahora solo agendamos valoraciones de primera vez para implantes y ortodoncia, y ofrece conectarlo con el equipo: "Por ahora solo puedo agendar valoraciones de primera vez para implantes dentales u ortodoncia. Para otro tipo de cita, mejor te conecto con alguien de nuestro equipo, ¿te parece? 😊"
 
Si el paciente pide una valoración de implantes u ortodoncia (y es su primera vez, no un seguimiento):
1. Pregunta su nombre completo (si no lo sabes ya).
2. Confirma cuál de los dos tratamientos le interesa: implantes u ortodoncia.
3. Pregunta qué día y hora prefiere, dentro del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00). Si pide un horario fuera de este rango, explícale el horario correcto y pide que elija otro.
4. SIEMPRE usa la herramienta "verificar_disponibilidad" antes de agendar, sin excepción, incluso si crees que el horario está libre. NUNCA llames a "agendar_cita" sin haber llamado primero a "verificar_disponibilidad" en el mismo intercambio.
5. Si el horario está disponible, antes de agendar, MUESTRA un resumen al paciente y pide confirmación explícita. Ejemplo: "Perfecto, ¿confirmas tu cita de valoración de [implantes/ortodoncia] para el [día] [fecha] a las [hora], a nombre de [nombre]? 😊" y espera su respuesta (sí/no) en el siguiente mensaje. NO llames a "agendar_cita" en este mismo turno.
6. Solo cuando el paciente confirme explícitamente (ej. "sí", "confirmo", "está bien"), usa la herramienta "agendar_cita" para crearla (el motivo debe ser "Valoración de implantes" o "Valoración de ortodoncia").
7. Si "agendar_cita" tiene éxito, manda un mensaje de confirmación final, claro y completo, con todos los datos: tratamiento, fecha, hora y nombre del paciente. Ejemplo: "¡Listo, [nombre]! Tu cita de valoración de [tratamiento] quedó agendada para el [día] [fecha] a las [hora]. Te esperamos en Torres Adalid 205, INT 201, Colonia Del Valle 🦷😊"
8. Si el paciente dice que no confirma, o pide cambiar algo, vuelve a preguntar el dato correcto y repite el resumen antes de agendar.
9. Si al intentar agendar el horario resulta ocupado (puede pasar si alguien más lo tomó mientras conversaban), avísale amablemente y pide que elija otro horario. No intentes agendar igual.
- Siempre usa el año 2026 si el paciente no especifica año.
- Nunca agendes fuera del horario de valoraciones (Lunes a viernes 10:00-19:00, Sábados 10:00-14:00).
- Nunca agendes algo que no sea una valoración de primera vez de implantes u ortodoncia.
- Nunca llames a "agendar_cita" sin que el paciente haya confirmado explícitamente el resumen primero.
 
CANCELAR O REAGENDAR CITAS:
Si el paciente quiere cancelar su cita:
1. Confirma que quiere cancelar preguntando: "¿Confirmas que deseas cancelar tu cita? Esta acción no se puede deshacer 😊"
2. Solo si confirma, usa la herramienta "cancelar_cita"
3. Confirma con un mensaje cálido: "Tu cita ha sido cancelada. Si en algún momento quieres reagendar, aquí estamos 🦷"
 
Si el paciente quiere reagendar su cita:
1. Pregunta la nueva fecha y hora que prefiere (dentro del horario de valoraciones)
2. Usa "verificar_disponibilidad" para confirmar que el nuevo horario está libre
3. Muestra un resumen y pide confirmación antes de reagendar
4. Solo si confirma, usa "reagendar_cita"
5. Confirma con un mensaje cálido incluyendo la nueva fecha y hora
 
CONECTAR CON UN HUMANO:
Si el paciente pide explícitamente hablar con una persona, un asesor o un humano, o si preguntan algo que no está en esta información (por ejemplo dudas médicas específicas, quejas, casos raros que no sabes resolver):
1. Sé honesta y ofrece conectarlo, por ejemplo: "Esa información mejor te la confirma alguien de nuestro equipo, ¿quieres que te conecte? 😊"
2. Si el paciente pidió hablar con un humano directamente, o si acepta que lo conectes, usa la herramienta "escalar_a_humano" (con un motivo breve de qué necesita) ANTES de responderle.
3. Después de usar la herramienta, confirma al paciente con un mensaje cálido, por ejemplo: "Listo, ya avisé a alguien de nuestro equipo, en breve te contactan por este mismo WhatsApp 🙌" — no prometas un número o tiempo que no sepas con certeza.
4. Una vez que uses "escalar_a_humano" en la conversación, no sigas intentando resolver tú el tema ni agendar nada: el equipo se hará cargo.

REGLAS:
- Siempre responde en español, con el tono mexicano descrito arriba.
- Nunca inventes precios, servicios o promociones que no estén aquí.`;
 
function getSystemPrompt() {
  const fechaHoy = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    timeZone: 'America/Mexico_City'
  });
  const ahora = new Date().toLocaleTimeString('es-MX', {
    hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Mexico_City'
  });
  return `La fecha de hoy en Ciudad de México es: ${fechaHoy}, hora actual: ${ahora}. Usa esta fecha y hora como referencia para interpretar correctamente cuando el paciente diga "mañana", "el lunes", "la próxima semana", "hoy", etc. Nunca sugieras ni agendes fechas que ya pasaron. Si el paciente pide una cita para "hoy" verifica que la hora solicitada no haya pasado ya.\n\n` + SYSTEM_PROMPT_BASE;
}
 
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
  {
    name: 'cancelar_cita',
    description: 'Cancela la cita activa del paciente en Google Calendar y en la base de datos. Úsala solo cuando el paciente confirme explícitamente que quiere cancelar.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'Número de teléfono del paciente' },
      },
      required: ['telefono'],
    },
  },
  {
    name: 'reagendar_cita',
    description: 'Reagenda la cita activa del paciente a una nueva fecha y hora. Verifica disponibilidad primero con verificar_disponibilidad antes de llamar esta herramienta.',
    input_schema: {
      type: 'object',
      properties: {
        telefono: { type: 'string', description: 'Número de teléfono del paciente' },
        nuevaFechaHoraInicio: { type: 'string', description: 'Nueva fecha y hora de inicio en formato ISO' },
        nuevaFechaHoraFin: { type: 'string', description: 'Nueva fecha y hora de fin en formato ISO' },
      },
      required: ['telefono', 'nuevaFechaHoraInicio', 'nuevaFechaHoraFin'],
    },
  },
  {
    name: 'escalar_a_humano',
    description: 'Marca la conversación para que la atienda una persona del equipo y le avisa por WhatsApp de inmediato. Úsala cuando: el paciente pida explícitamente hablar con una persona/asesor/humano, o cuando te pregunten algo que no está en tu información (dudas médicas específicas, quejas, casos que no sabes resolver) y el paciente acepte que lo conectes. Después de llamar esta herramienta, el equipo ya fue notificado: no vuelvas a agendar ni a inventar información, solo confirma al paciente que en breve lo contactan.',
    input_schema: {
      type: 'object',
      properties: {
        motivo: { type: 'string', description: 'Resumen breve (1-2 frases) de qué necesita el paciente, para que el equipo sepa de qué se trata antes de contactarlo.' },
      },
      required: ['motivo'],
    },
  },
];

// Avisa al equipo por WhatsApp que un paciente necesita atención humana, y
// marca la conversación como pausada para que el bot deje de responderle
// automáticamente (hasta que el equipo mande "reanudar <telefono>").
async function escalarAHumano(telefono, motivo) {
  await marcarEsperandoHumano(telefono, motivo);
  const aviso = `🙋 Un paciente necesita atención humana.\n\nNúmero: +${telefono}\nMotivo: ${motivo || 'No especificado'}\n\nEl bot dejó de responderle automáticamente. Escríbele directo a este número por WhatsApp. Cuando termines, manda aquí "reanudar ${telefono}" para que el bot vuelva a atenderlo automáticamente.`;
  await sendWhatsAppMessage(NUMERO_EQUIPO, aviso);
}
 
const conversationHistory = {};
 
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
 
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
 
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];
 
    if (!message) return;
 
    const from = message.from;
 
    if (message.type === 'audio') {
      await guardarMensaje(from, 'user', '[nota de voz recibida]');
      // Si ya está pausada esperando a un humano, no se contesta con el
      // aviso automático de "no puedo escuchar audio": se deja que el
      // equipo, que ya fue notificado, lo escuche/atienda directamente.
      if (await estaEsperandoHumano(from)) return;
      const avisoVoz = 'No puedo escuchar mensajes de voz. Por favor, escribe tu petición y con gusto la atenderé 😊';
      await sendWhatsAppMessage(from, avisoVoz);
      await guardarMensaje(from, 'assistant', avisoVoz);
      return;
    }
 
    const userText = message.text?.body;

    if (!userText) return;

    console.log(`Mensaje de ${from}: ${userText}`);

    const lower = userText.toLowerCase().trim();

    // Comando del EQUIPO (no del paciente): si el mensaje llega desde el
    // número del equipo y dice "reanudar <telefono>", se quita la pausa de
    // ese paciente para que el bot vuelva a responderle automáticamente.
    if (from.replace(/\D/g, '') === NUMERO_EQUIPO.replace(/\D/g, '') && lower.startsWith('reanudar')) {
      const telefonoObjetivo = lower.replace('reanudar', '').trim().replace(/\D/g, '');
      if (telefonoObjetivo) {
        await quitarEsperandoHumano(telefonoObjetivo);
        await sendWhatsAppMessage(from, `✅ Listo, el bot vuelve a responder automáticamente a +${telefonoObjetivo}.`);
      } else {
        await sendWhatsAppMessage(from, 'Para reanudar, manda "reanudar <numero>", ej. "reanudar 5215512345678".');
      }
      return;
    }

    await guardarMensaje(from, 'user', userText);

    // Palabras clave directas del paciente pidiendo hablar con una persona:
    // se resuelve al instante, sin pasar por Claude, para mayor rapidez y
    // confiabilidad.
    if (['humano', 'agente', 'persona', 'asesor', 'humana'].includes(lower)) {
      await escalarAHumano(from, 'El paciente pidió hablar directamente con una persona del equipo.');
      const respuestaFija = 'Listo, ya avisé a alguien de nuestro equipo, en breve te contactan por este mismo WhatsApp 🙌';
      await sendWhatsAppMessage(from, respuestaFija);
      await guardarMensaje(from, 'assistant', respuestaFija);
      return;
    }

    // Si esta conversación ya está pausada esperando a un humano, el bot no
    // vuelve a responder automáticamente (para no chocar con la persona del
    // equipo). El mensaje ya quedó guardado arriba para que el equipo lo vea
    // en el panel de conversaciones.
    if (await estaEsperandoHumano(from)) {
      console.log(`Mensaje de ${from} ignorado por el bot: conversación esperando atención humana.`);
      return;
    }

    if (!conversationHistory[from]) conversationHistory[from] = [];
    conversationHistory[from].push({ role: 'user', content: userText });
    conversationHistory[from] = conversationHistory[from].slice(-6);

    const claudeReply = await askClaude(conversationHistory[from], from);

    conversationHistory[from].push({ role: 'assistant', content: claudeReply });

    await sendWhatsAppMessage(from, claudeReply);
    await guardarMensaje(from, 'assistant', claudeReply);
  } catch (err) {
    console.error('Error procesando mensaje:', err);
  }
});
 
// ============ LLAMAR A CLAUDE (con soporte de tools) ============
async function askClaude(messages, telefonoUsuario) {
  let currentMessages = [...messages];
 
  for (let i = 0; i < 4; i++) {
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
        system: getSystemPrompt(),
        messages: currentMessages,
        tools: TOOLS,
      }),
    });
 
    const data = await response.json();

    if (data.error) {
      console.error('Error de Claude API:', data.error);
      // Falla técnica real (no que el bot "no sepa" algo del negocio): igual
      // se avisa al equipo y se pausa la conversación, para que un humano
      // siga la conversación en lugar de dejar al paciente sin respuesta.
      await escalarAHumano(telefonoUsuario, 'Falla técnica del bot (error de la API de Claude). El paciente se quedó sin respuesta automática.');
      return 'Disculpa, tuve un problema técnico. Ya le avisé a nuestro equipo para que te contacten directamente 🙌';
    }
 
    if (data.stop_reason === 'tool_use') {
      // Claude puede pedir VARIAS herramientas en la misma respuesta.
      // Hay que ejecutar TODAS y devolver un tool_result por cada una,
      // o la API rechaza la conversación (esta era la causa del error original).
      const toolUseBlocks = data.content.filter((b) => b.type === 'tool_use');
 
      currentMessages.push({ role: 'assistant', content: data.content });
 
      const toolResultsContent = [];
      for (const toolUseBlock of toolUseBlocks) {
        const toolResult = await ejecutarHerramienta(toolUseBlock, telefonoUsuario);
        toolResultsContent.push({
          type: 'tool_result',
          tool_use_id: toolUseBlock.id,
          content: JSON.stringify(toolResult),
        });
      }
 
      currentMessages.push({ role: 'user', content: toolResultsContent });
      continue;
    }
 
    const textBlock = data.content.find((b) => b.type === 'text');
    if (textBlock) return textBlock.text;

    console.error('Respuesta de Claude sin bloque de texto:', JSON.stringify(data));
    await escalarAHumano(telefonoUsuario, 'El bot no logró generar una respuesta clara para el paciente.');
    return 'Disculpa, no entendí bien tu mensaje. Ya le avisé a nuestro equipo para que te contacten directamente 🙌';
  }

  // Se agotaron los 4 intentos de llamar herramientas sin llegar a una
  // respuesta final: mejor avisar al equipo que dejar al paciente sin nada.
  await escalarAHumano(telefonoUsuario, 'El bot no logró completar la solicitud del paciente después de varios intentos.');
  return 'Disculpa, tuve un problema procesando tu solicitud. Ya le avisé a nuestro equipo para que te contacten directamente 🙌';
}
 
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
 
      await guardarCita(
        telefonoUsuario,
        input.paciente,
        input.motivo,
        input.fechaHoraInicio
      );
 
      return { exito: true, eventoId: evento.id };
    }
 
    if (name === 'cancelar_cita') {
      const cita = await obtenerCitaPorTelefono(input.telefono || telefonoUsuario);
      if (!cita) return { exito: false, mensaje: 'No se encontró ninguna cita activa para este número.' };
      const evento = await buscarEventoCalendar(cita.nombre, cita.fecha_hora);
      if (evento) await cancelarEventoCalendar(evento.id);
      await cancelarCitaDB(cita.id);
      return { exito: true, mensaje: `Cita de ${cita.nombre} cancelada exitosamente.` };
    }
 
    if (name === 'reagendar_cita') {
      const cita = await obtenerCitaPorTelefono(input.telefono || telefonoUsuario);
      if (!cita) return { exito: false, mensaje: 'No se encontró ninguna cita activa para este número.' };
      const evento = await buscarEventoCalendar(cita.nombre, cita.fecha_hora);
      if (evento) {
        await reagendarEventoCalendar(evento.id, input.nuevaFechaHoraInicio, input.nuevaFechaHoraFin);
      }
      await reagendarCitaDB(cita.id, input.nuevaFechaHoraInicio);
      return { exito: true, mensaje: `Cita reagendada exitosamente para ${input.nuevaFechaHoraInicio}.` };
    }

    if (name === 'escalar_a_humano') {
      await escalarAHumano(telefonoUsuario, input.motivo);
      return { exito: true, mensaje: 'Equipo notificado. Ya puedes confirmarle al paciente que en breve lo contactan.' };
    }

    return { error: 'Herramienta no reconocida' };
  } catch (err) {
    console.error(`Error ejecutando herramienta ${name}:`, err);
    return { error: 'No se pudo completar la acción en el calendario' };
  }
}
 
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
 
app.get('/conversaciones', async (req, res) => {
  const clave = req.query.clave;
  if (clave !== process.env.PANEL_CLAVE) {
    return res.status(401).send('<h2 style="font-family:sans-serif;padding:2rem">Acceso no autorizado. Agrega ?clave=TU_CLAVE a la URL.</h2>');
  }
 
  try {
    const mensajes = await obtenerTodosLosMensajes();
 
    const conversaciones = {};
    for (const msg of mensajes) {
      if (!conversaciones[msg.telefono]) conversaciones[msg.telefono] = [];
      conversaciones[msg.telefono].push(msg);
    }
 
    const telefonos = Object.keys(conversaciones);
 
    let html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Conversaciones — Bot FDS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, sans-serif; background: #f0f2f5; color: #111; }
    header { background: #1a6fa8; color: white; padding: 1rem 1.5rem; display: flex; align-items: center; gap: 0.75rem; }
    header h1 { font-size: 1.1rem; font-weight: 600; }
    header span { font-size: 0.85rem; opacity: 0.8; }
    .layout { display: flex; height: calc(100vh - 56px); }
    .sidebar { width: 300px; min-width: 300px; background: white; border-right: 1px solid #e0e0e0; overflow-y: auto; }
    .contacto { padding: 0.9rem 1rem; border-bottom: 1px solid #f0f0f0; cursor: pointer; transition: background 0.15s; }
    .contacto:hover, .contacto.activo { background: #e8f4fd; }
    .contacto .num { font-size: 0.85rem; font-weight: 600; color: #1a6fa8; }
    .contacto .preview { font-size: 0.78rem; color: #666; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .contacto .fecha { font-size: 0.72rem; color: #999; margin-top: 2px; }
    .chat { flex: 1; display: flex; flex-direction: column; }
    .chat-header { padding: 0.85rem 1.2rem; background: white; border-bottom: 1px solid #e0e0e0; font-size: 0.9rem; font-weight: 600; color: #1a6fa8; }
    .mensajes { flex: 1; overflow-y: auto; padding: 1.2rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .burbuja { max-width: 70%; padding: 0.55rem 0.85rem; border-radius: 12px; font-size: 0.88rem; line-height: 1.45; }
    .burbuja.user { background: white; border: 1px solid #e0e0e0; align-self: flex-start; border-bottom-left-radius: 3px; }
    .burbuja.assistant { background: #d9f7be; align-self: flex-end; border-bottom-right-radius: 3px; }
    .burbuja .hora { font-size: 0.7rem; color: #999; margin-top: 3px; text-align: right; }
    .placeholder { flex: 1; display: flex; align-items: center; justify-content: center; color: #aaa; font-size: 0.9rem; }
    .vacio { padding: 2rem; text-align: center; color: #aaa; font-size: 0.85rem; }
  </style>
</head>
<body>
<header>
  <div>🦷</div>
  <div>
    <h1>Panel de conversaciones</h1>
    <span>${telefonos.length} contacto${telefonos.length !== 1 ? 's' : ''}</span>
  </div>
</header>
<div class="layout">
  <div class="sidebar" id="sidebar">`;
 
    if (telefonos.length === 0) {
      html += `<div class="vacio">Aún no hay mensajes registrados.</div>`;
    }
 
    for (const tel of telefonos) {
      const msgs = conversaciones[tel];
      const ultimo = msgs[msgs.length - 1];
      const preview = ultimo.contenido.length > 50 ? ultimo.contenido.substring(0, 50) + '…' : ultimo.contenido;
      const fecha = new Date(ultimo.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
      html += `<div class="contacto" onclick="verChat('${tel}')" id="c-${tel}">
        <div class="num">+${tel}</div>
        <div class="preview">${preview}</div>
        <div class="fecha">${fecha}</div>
      </div>`;
    }
 
    for (const tel of Object.keys(conversaciones)) {
      conversaciones[tel] = conversaciones[tel].map(m => ({
        ...m,
        hora_fmt: new Date(m.creado_en).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' }),
        fecha_fmt: new Date(m.creado_en).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'America/Mexico_City' }),
      }));
    }
 
    html += `</div>
  <div class="chat" id="chat-area">
    <div class="placeholder">← Selecciona una conversación</div>
  </div>
</div>
 
<script>
const data = ${JSON.stringify(conversaciones)};
 
function verChat(tel) {
  document.querySelectorAll('.contacto').forEach(el => el.classList.remove('activo'));
  const item = document.getElementById('c-' + tel);
  if (item) item.classList.add('activo');
 
  const msgs = data[tel] || [];
  let html = '<div class="chat-header">+' + tel + ' — ' + msgs.length + ' mensajes</div><div class="mensajes" id="msgs">';
  for (const m of msgs) {
    html += '<div class="burbuja ' + m.rol + '"><div>' + m.contenido.replace(/</g,'&lt;') + '</div><div class="hora">' + m.fecha_fmt + ' ' + m.hora_fmt + '</div></div>';
  }
  html += '</div>';
  document.getElementById('chat-area').innerHTML = html;
  const msgsDiv = document.getElementById('msgs');
  if (msgsDiv) msgsDiv.scrollTop = msgsDiv.scrollHeight;
}
</script>
</body></html>`;
 
    res.send(html);
  } catch (err) {
    console.error('Error cargando conversaciones:', err);
    res.status(500).send('<h2 style="font-family:sans-serif;padding:2rem">Error cargando conversaciones. Verifica que la base de datos esté conectada.</h2>');
  }
});
 
app.listen(PORT, async () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  try {
    await inicializarDB();
  } catch (err) {
    console.error('Error inicializando la base de datos:', err);
  }
 
  const ahora = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Mexico_City' }));
  const proximasDecena = new Date(ahora);
  proximasDecena.setHours(10, 0, 0, 0);
  if (proximasDecena <= ahora) proximasDecena.setDate(proximasDecena.getDate() + 1);
 
  const msHastaLas10 = proximasDecena - ahora;
  console.log(`Próximo envío de recordatorios en ${Math.round(msHastaLas10 / 1000 / 60)} minutos`);
 
  setTimeout(() => {
    procesarRecordatorios();
    setInterval(procesarRecordatorios, 24 * 60 * 60 * 1000);
  }, msHastaLas10);
});
