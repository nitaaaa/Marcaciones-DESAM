require('dotenv').config();
const { Pool } = require('pg');
const sendEmail = require('./services/emailService');
const { construirMensaje } = require('./emailMessageBuilder');
const { obtenerTransaccion, enviarMarcacionAPISaturno, enviarMarcacionAPIProexsi } = require('./services/apiService');
const { calcularDigitoVerificador } = require('./utils/rutUtils');

// Configuracion de la conexion a PostgreSQL
const poolIclock = new Pool({
  host: process.env.DB_ICLOCK_HOST,
  user: process.env.DB_ICLOCK_USER,
  password: process.env.DB_ICLOCK_PASSWORD,
  database: process.env.DB_ICLOCK_DATABASE,
  port: parseInt(process.env.DB_ICLOCK_PORT) || 5432
});

// Funcion para verificar qué operaciones ya se completaron
async function verificarOperacionesCompletadas(transactionId) {
  try {
    const result = await poolIclock.query(
      'SELECT operacion FROM notificacion_operaciones WHERE iclock_transaction_id = $1 AND completada = true',
      [transactionId]
    );
    
    const completadas = {};
    result.rows.forEach(row => {
      completadas[row.operacion] = true;
    });
    
    return completadas;
  } catch (error) {
    console.error('Error al verificar operaciones completadas:', error);
    return {};
  }
}

// Funcion para marcar una operacion como completada
async function marcarOperacionCompletada(transactionId, operacion) {
  try {
    await poolIclock.query(`
      INSERT INTO notificacion_operaciones (iclock_transaction_id, operacion, completada, intentos)
      VALUES ($1, $2, true, 1)
      ON CONFLICT (iclock_transaction_id, operacion) 
      DO UPDATE SET completada = true, intentos = notificacion_operaciones.intentos + 1
    `, [transactionId, operacion]);
  } catch (error) {
    console.error(`Error al marcar operacion completada:`, error);
  }
}

// Funcion separada para procesar envío de email
async function procesarEnvioEmail(transaccion, rutCompleto) {
  try {
    const mensaje = construirMensaje(transaccion);
    const funcionarios = await poolIclock.query(
      'SELECT email FROM personnel_employee WHERE emp_code = $1',
      [transaccion.emp_code]
    );
    
    if (!funcionarios.rows || funcionarios.rows.length === 0 || !funcionarios.rows[0].email || funcionarios.rows[0].email.trim() === '') {
      return true; // No hay email que enviar, consideramos como exitoso
    }
    
    const emailEnviado = await sendEmail(
      funcionarios.rows[0].email,
      'Registro de Marcacion',
      mensaje
    );
    
    if (!emailEnviado) {
      console.warn(`Email no enviado para RUT ${rutCompleto} - Se reintentará en la siguiente iteracion`);
      return false;
    }
    
    //console.log(`Email enviado exitosamente para RUT ${rutCompleto}`);
    return true;
    
  } catch (error) {
    console.error(`Error en envío de email para RUT ${rutCompleto}:`, error);
    return false;
  }
}

// Funcion separada para procesar envío a API Saturno
async function procesarEnvioAPISaturno(transaccion) {
  try {
    const resultado = await enviarMarcacionAPISaturno(transaccion);
    if (!resultado.success) {
      console.error(`Error al enviar a Saturno: ${resultado.error}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(`Error en envío a Saturno:`, error);
    return false;
  }
}

// Funcion separada para procesar envío a API Proexsi
async function procesarEnvioAPIProexsi(transaccion) {
  try {
    const resultado = await enviarMarcacionAPIProexsi(transaccion);
    if (resultado.success) {
      const horaEnvioProexsi = new Date().toLocaleString('es-ES');
      //console.log(`[${horaEnvioProexsi}] Marcacion enviada exitosamente a Proexsi para empleado ${transaccion.emp_code}`);
      return true;
    } else {
      console.error(`Error en Proexsi - Estado: ${resultado.estadoMarcacion}, Mensaje: ${resultado.mensaje}`);
      return false;
    }
  } catch (error) {
    console.error(`Error en envío a Proexsi:`, error);
    return false;
  }
}

// Funcion para consultar las notificaciones pendientes
async function consultarNotificacionesPendientes() {
  try {
    
    const query = `
      SELECT 
          np.*,
          ns.email,
          ns.api,
          ns.api_proexsi,
          it.area_alias,
          it.terminal_sn,
          it.emp_id,
          it.punch_state
      FROM notificaciones_pendientes np
      INNER JOIN iclock_transaction it ON np.iclock_transaction_id = it.id
      LEFT JOIN personnel_area pa ON it.area_alias = pa.area_name
      LEFT JOIN notification_settings ns ON pa.id = ns.personnel_area_id
      WHERE np.procesado = false
      `;
    
    const result = await poolIclock.query(query);
    
    if (result.rows.length > 0) {
      const horaActual = new Date().toLocaleString('es-ES');
      console.log(`[${horaActual}] Notificaciones pendientes encontradas:`, result.rows.length);


      // Procesar en lotes para evitar sobrecarga de memoria y conexiones (sobretodo para Proexsi)
      const TAMANO_LOTE = 40;
      for (let inicio = 0; inicio < result.rows.length; inicio += TAMANO_LOTE) {
        const lote = result.rows.slice(inicio, inicio + TAMANO_LOTE);

        // Procesar todas las notificaciones del lote en paralelo
        const promesasProcesamiento = lote.map(async (notificacion) => {
          const transaccion = await obtenerTransaccion(notificacion.iclock_transaction_id);
          const rutCompleto = transaccion.emp_code + '-' + calcularDigitoVerificador(transaccion.emp_code);

          try {
            const operacionesCompletadas = await verificarOperacionesCompletadas(notificacion.iclock_transaction_id);

            let todasLasOperacionesCompletadas = true;
            const operacionesPendientes = [];
            const operacionesRequeridas = [];

            // Procesar envío de email si está configurado o si es marcación desde App móvil
            if (notificacion.email || notificacion.terminal_sn == 'App'){
              operacionesRequeridas.push('email');
              if (!operacionesCompletadas.email) {
                operacionesPendientes.push('email');
                const emailExitoso = await procesarEnvioEmail(transaccion, rutCompleto);
                if (emailExitoso) {
                  await marcarOperacionCompletada(notificacion.iclock_transaction_id, 'email');
                  operacionesCompletadas.email = true;
                } else {
                  todasLasOperacionesCompletadas = false;
                }
              }
            }

            // Procesar envío a API Saturno si está configurado
            if (notificacion.api) {
              operacionesRequeridas.push('api_saturno');
              if (!operacionesCompletadas.api_saturno) {
                operacionesPendientes.push('api_saturno');
                const apiExitosa = await procesarEnvioAPISaturno(transaccion);
                if (apiExitosa) {
                  await marcarOperacionCompletada(notificacion.iclock_transaction_id, 'api_saturno');
                  operacionesCompletadas.api_saturno = true;
                } else {
                  todasLasOperacionesCompletadas = false;
                }
              }
            }

            // Procesar envío a API Proexsi si está configurado
            // Solo procesa entradas (0) y salidas (1), ignora otros estados
            if (notificacion.api_proexsi && (notificacion.punch_state == "0" || notificacion.punch_state == "1")) {
              operacionesRequeridas.push('api_proexsi');
              if (!operacionesCompletadas.api_proexsi) {
                operacionesPendientes.push('api_proexsi');
                const apiProexsiExitosa = await procesarEnvioAPIProexsi(transaccion);
                if (apiProexsiExitosa) {
                  await marcarOperacionCompletada(notificacion.iclock_transaction_id, 'api_proexsi');
                  operacionesCompletadas.api_proexsi = true;
                } else {
                  todasLasOperacionesCompletadas = false;
                }
              }
            }

            // Verificar si todas las operaciones requeridas se han completado
            const todasCompletadas = operacionesRequeridas.every(op => 
              operacionesCompletadas[op] === true
            );

            // Marcar como procesada solo si todas las operaciones requeridas fueron exitosas
            if (todasCompletadas && todasLasOperacionesCompletadas) {
              await poolIclock.query(
                'UPDATE notificaciones_pendientes SET procesado = true WHERE iclock_transaction_id = $1',
                [notificacion.iclock_transaction_id]
              );
            } else {
              const pendientesTexto = operacionesPendientes.length > 0 ? operacionesPendientes.join(', ') : 'ninguna nueva';
              console.log(`Notificacion ${notificacion.iclock_transaction_id} parcialmente procesada - Operaciones pendientes: ${pendientesTexto}`);
            }

          } catch (error) {
            console.error(`Error procesando notificacion ${notificacion.iclock_transaction_id}:`, error);
          }

          // Si no hay ninguna operación configurada, marcar como procesada de todas formas
          if (!notificacion.email && !notificacion.api && !notificacion.api_proexsi) {
            await poolIclock.query(
              'UPDATE notificaciones_pendientes SET procesado = true WHERE iclock_transaction_id = $1',
              [notificacion.iclock_transaction_id]
            );
          }
        });

        // Esperar a que todas las notificaciones del lote se procesen antes de continuar
        await Promise.all(promesasProcesamiento);
      }
    }
  } catch (error) {
    console.error(`Error al consultar las notificaciones:`, error);
  }
}

// Funcion principal
// Inicia el bucle infinito que consulta notificaciones pendientes cada 5 segundos
async function main() {
  try {
    console.log('Iniciando aplicacion...');
    
    // Funcion para esperar un tiempo específico
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    
    // Bucle infinito
    while (true) {
      try {
        await consultarNotificacionesPendientes();
      } catch (error) {
        console.error('Error en la ejecucion:', error);
      }
      
      // Esperar 5 segundos antes de la siguiente ejecucion
      await sleep(5000);
    }
  } catch (error) {
    console.error('Error fatal en la aplicacion:', error);
  }
}

// Manejo de cierre de la aplicacion
process.on('SIGINT', async () => {
  console.log('\nCerrando la aplicacion...');
  await poolIclock.end();
  process.exit(0);
});

// Iniciar la aplicacion
main();