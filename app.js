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

// Funcion para guardar error en el historial (tabla notificacion_errores)
async function guardarErrorEnHistorial(transactionId, operacion, mensajeError) {
  try {
    await poolIclock.query(
      `INSERT INTO notificacion_errores (iclock_transaction_id, operacion, error_mensaje)
       VALUES ($1, $2, $3)`,
      [transactionId, operacion, mensajeError]
    );
  } catch (error) {
    console.error(`Error al guardar error en historial:`, error);
  }
}

// Funcion para verificar si una operacion esta bloqueada por fallos consecutivos
async function verificarOperacionBloqueada(transactionId, operacion, maxFallos = 3) {
  try {
    const result = await poolIclock.query(
      `SELECT intentos, error_mensaje 
       FROM notificacion_operaciones 
       WHERE iclock_transaction_id = $1 AND operacion = $2 AND completada = false`,
      [transactionId, operacion]
    );
    
    if (result.rows.length > 0) {
      const intentos = result.rows[0].intentos || 0;
      const errorMensaje = result.rows[0].error_mensaje || '';
      
      // Verificar si esta bloqueado: intentos >= maxFallos O mensaje contiene BLOQUEADO
      if (intentos >= maxFallos || errorMensaje.includes('BLOQUEADO')) {
        return true;
      }
    }
    
    return false;
  } catch (error) {
    console.error('Error al verificar operacion bloqueada:', error);
    return false;
  }
}

// Funcion para registrar un fallo en una operacion
async function registrarFalloOperacion(transactionId, operacion, mensajeError, transaccion = null) {
  try {
    // Primero: guardar el error en el historial
    await guardarErrorEnHistorial(transactionId, operacion, mensajeError);
    
    // Consultar intentos actuales
    const result = await poolIclock.query(
      `SELECT intentos FROM notificacion_operaciones 
       WHERE iclock_transaction_id = $1 AND operacion = $2 AND completada = false`,
      [transactionId, operacion]
    );
    
    const intentosActuales = result.rows.length > 0 ? (result.rows[0].intentos || 0) : 0;
    const nuevosIntentos = intentosActuales + 1;
    
    // Si llega a 3 fallos, bloquear la operacion y enviar alerta
    if (nuevosIntentos >= 3) {
      const errorFinal = `BLOQUEADO: 3 fallos consecutivos. Último error: ${mensajeError}`;
      
      await poolIclock.query(`
        INSERT INTO notificacion_operaciones (iclock_transaction_id, operacion, completada, intentos, error_mensaje)
        VALUES ($1, $2, false, $3, $4)
        ON CONFLICT (iclock_transaction_id, operacion) 
        DO UPDATE SET intentos = $3, error_mensaje = $4
      `, [transactionId, operacion, nuevosIntentos, errorFinal]);
      
      //console.warn(`Operación ${operacion} bloqueada para transacción ${transactionId} después de ${nuevosIntentos} fallos consecutivos`);
      
      // Enviar correo de alerta cuando se bloquea
      await enviarAlertaBloqueo(transactionId, operacion, mensajeError, transaccion);
      
      return nuevosIntentos;
    } else {
      // Si aún no llega a 3, solo registrar el fallo
      await poolIclock.query(`
        INSERT INTO notificacion_operaciones (iclock_transaction_id, operacion, completada, intentos, error_mensaje)
        VALUES ($1, $2, false, $3, $4)
        ON CONFLICT (iclock_transaction_id, operacion) 
        DO UPDATE SET intentos = $3, error_mensaje = $4
      `, [transactionId, operacion, nuevosIntentos, mensajeError]);
      
      return nuevosIntentos;
    }
  } catch (error) {
    console.error(`Error al registrar fallo de operación:`, error);
  }
}

// Funcion para enviar alerta de bloqueo por correo
async function enviarAlertaBloqueo(transactionId, operacion, mensajeError, transaccion) {
  try {
    const rutCompleto = transaccion ? 
      transaccion.emp_code + '-' + calcularDigitoVerificador(transaccion.emp_code) : 
      'N/A';
    
    const nombreEmpleado = transaccion ? 
      `${transaccion.first_name || ''} ${transaccion.last_name || ''}`.trim() : 
      'N/A';
    
    const fechaHora = transaccion && transaccion.punch_time ? 
      new Date(transaccion.punch_time).toLocaleString('es-ES') : 
      new Date().toLocaleString('es-ES');
    
    const mensajeAlerta = {
      text: `ALERTA: Bloqueo de operación en sistema de marcaciones\n\n` +
            `Se ha bloqueado la operación "${operacion}" después de 3 fallos consecutivos.\n\n` +
            `Detalles:\n` +
            `- ID Transacción: ${transactionId}\n` +
            `- Operación: ${operacion}\n` +
            `- RUT Empleado: ${rutCompleto}\n` +
            `- Nombre: ${nombreEmpleado}\n` +
            `- Fecha/Hora Marcación: ${fechaHora}\n` +
            `- Último Error: ${mensajeError}\n\n` +
            `La operación no se volverá a intentar automáticamente.\n` +
            `Por favor, revisar la configuración y el estado del servicio.`,
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2 style="color: #d32f2f;">⚠️ ALERTA: Bloqueo de operación en sistema de marcaciones</h2>
          <p>Se ha bloqueado la operación <strong>"${operacion}"</strong> después de <strong>3 fallos consecutivos</strong>.</p>
          
          <h3>Detalles del bloqueo:</h3>
          <ul>
            <li><strong>ID Transacción:</strong> ${transactionId}</li>
            <li><strong>Operación:</strong> ${operacion}</li>
            <li><strong>RUT Empleado:</strong> ${rutCompleto}</li>
            <li><strong>Nombre:</strong> ${nombreEmpleado}</li>
            <li><strong>Fecha/Hora Marcación:</strong> ${fechaHora}</li>
            <li><strong>Último Error:</strong> ${mensajeError}</li>
          </ul>
          
          <p style="color: #d32f2f; font-weight: bold;">
            ⚠️ La operación no se volverá a intentar automáticamente.<br>
            Por favor, revisar la configuración y el estado del servicio.
          </p>
        </div>
      `
    };
    
    const emailAlerta = process.env.EMAIL_ALERTA;
    const emailEnviado = await sendEmail(
      emailAlerta,
      `[ALERTA] Bloqueo de operación ${operacion} - Transacción ${transactionId}`,
      mensajeAlerta
    );
    
    if (!emailEnviado) {
      console.error(`Error al enviar alerta de bloqueo por correo para transacción ${transactionId}`);
    }
  } catch (error) {
    console.error(`Error al enviar alerta de bloqueo:`, error);
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
// Retorna objeto con { success, error?, resultado? }
async function procesarEnvioAPIProexsi(transaccion) {
  try {
    const resultado = await enviarMarcacionAPIProexsi(transaccion);
    if (resultado.success) {
      const horaEnvioProexsi = new Date().toLocaleString('es-ES');
      return { success: true, resultado: resultado };
    } else {
      const mensajeError = resultado.error || resultado.mensaje || `Estado: ${resultado.estadoMarcacion}, Mensaje: ${resultado.mensaje}`;
      console.error(`Error en Proexsi - ${mensajeError}`);
      return { 
        success: false, 
        error: mensajeError,
        resultado: resultado
      };
    }
  } catch (error) {
    console.error(`Error en envío a Proexsi:`, error);
    return { 
      success: false, 
      error: error.message || 'Error desconocido en Proexsi',
      resultado: null
    };
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
          
          let operacionesBloqueadas = 0;

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
                // Verificar si la operación está bloqueada por fallos consecutivos
                const estaBloqueada = await verificarOperacionBloqueada(notificacion.iclock_transaction_id, 'api_proexsi', 3);
                
                if (estaBloqueada) {
                  operacionesBloqueadas++;
                  // No intentar más, pero no marcar como completada para que se sepa que falló
                } else {
                  operacionesPendientes.push('api_proexsi');
                  const resultado = await procesarEnvioAPIProexsi(transaccion);
                  if (resultado.success) {
                    await marcarOperacionCompletada(notificacion.iclock_transaction_id, 'api_proexsi');
                    operacionesCompletadas.api_proexsi = true;
                  } else {
                    // Registrar el fallo (esto enviará el correo si llega a 3 fallos)
                    await registrarFalloOperacion(
                      notificacion.iclock_transaction_id, 
                      'api_proexsi', 
                      resultado.error,
                      transaccion
                    );
                    todasLasOperacionesCompletadas = false;
                  }
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
              if (pendientesTexto != 'ninguna nueva') {
                console.log(`Notificacion ${notificacion.iclock_transaction_id} parcialmente procesada - Operaciones pendientes: ${pendientesTexto}`);
              }
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
          
          // Retornar cantidad de operaciones bloqueadas para el resumen
          return operacionesBloqueadas;
        });

        // Esperar a que todas las notificaciones del lote se procesen antes de continuar
        const resultados = await Promise.all(promesasProcesamiento);
        
        // Contar total de operaciones bloqueadas en este lote
        const totalBloqueadas = resultados.reduce((suma, bloqueadas) => suma + (bloqueadas || 0), 0);
        if (totalBloqueadas > 0) {
          console.log(`Operaciones bloqueadas detectadas en este lote: ${totalBloqueadas}`);
        }
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