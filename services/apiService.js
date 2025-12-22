require('dotenv').config();

const axios = require('axios');
const { Pool } = require('pg');
const { formatearFecha, formatearFechaHHMM, formatearFechaDDMMAAAA, formatearPeriodoAAAAMM } = require('../utils/dateUtils');

// Configuracion de la conexion a PostgreSQL usando variables de entorno
// Valores necesarios en .env:
// DB_ICLOCK_HOST=localhost
// DB_ICLOCK_USER=postgres
// DB_ICLOCK_PASSWORD=ZkDesamPm24
// DB_ICLOCK_DATABASE=biotime
// DB_ICLOCK_PORT=7496
const poolIclock = new Pool({
  host: process.env.DB_ICLOCK_HOST,
  user: process.env.DB_ICLOCK_USER,
  password: process.env.DB_ICLOCK_PASSWORD,
  database: process.env.DB_ICLOCK_DATABASE,
  port: parseInt(process.env.DB_ICLOCK_PORT) || 5432
});

let token = null;

// Configuracion de timeout para axios
const axiosInstance = axios.create({
    timeout: 5000, // 5 segundos de timeout global
    timeoutErrorMessage: 'La solicitud excedio el tiempo máximo de espera'
});

const axiosInstanceProexsi = axios.create({
    timeout: 60000, // 60 segundos de timeout específico para Proexsi
    timeoutErrorMessage: 'La solicitud a Proexsi excedio el tiempo máximo de espera'
});

async function obtenerToken() {
    try {
        console.log('Obteniendo token...');
        const response = await axios.post(
            `${process.env.API_URL}${process.env.API_ENDPOINT_TOKEN || '/jwt-api-token-auth/'}`,
            {
                username: process.env.API_USERNAME,
                password: process.env.API_PASSWORD
            },
            {
                headers: {
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log('Token obtenido exitosamente');
        return response.data.token;
    } catch (error) {
        console.error('Error al obtener token:');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else if (error.request) {
            console.error('No se recibio respuesta del servidor');
        } else {
            console.error('Error:', error.message);
        }
        throw error;
    }
}

// Funcion para obtener la transaccion de la base de datos
async function obtenerTransaccion(id) {
    try {
	//console.log(transaccion.punch_state)
        const query = `
            SELECT 
                t.*,
                pe.first_name,
                pe.last_name
            FROM iclock_transaction t
            INNER JOIN personnel_employee pe ON t.emp_code = pe.emp_code
            WHERE t.id = $1`;
        
        const result = await poolIclock.query(query, [id]);
        
        if (result.rows.length === 0) {
            console.warn(`No se encontro la transaccion con ID ${id}`);
            return null;
        }
        
        return result.rows[0];
    } catch (error) {
        console.error(`Error al obtener transaccion ${id} de la base de datos:`, error);
        throw error;
    }
}

// Funcion para enviar marcacion a la API de Saturno
// Convierte el estado de marcación (punch_state) al formato esperado por Saturno:
// - "C/In", "20", "10", "12" -> "0" (entrada)
// - "C/Out", "21", "11", "13" -> "1" (salida)
// - Otros valores se envían tal cual
async function enviarMarcacionAPISaturno(transaccion) {
    try {
        const payload = {
            institucion: 'MUNICIPALIDAD PUERTO MONTT',
            userid: transaccion.emp_code,
            checktime: formatearFecha(new Date(transaccion.punch_time)),
            checktype: transaccion.punch_state === 'C/In' || transaccion.punch_state === '20' || transaccion.punch_state === '10' || transaccion.punch_state === '12' ? '0' : 
                      transaccion.punch_state === 'C/Out' || transaccion.punch_state === '21' || transaccion.punch_state === '11' || transaccion.punch_state === '13' ? '1' : 
                      transaccion.punch_state,
            nombre_equipo: transaccion.area_alias
        };

        const response = await axiosInstance.post(
            `${process.env.API_URL_SATURNO}marcaje`,
            payload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': process.env.X_API_KEY,
                    'x-api-secret': process.env.X_API_SECRET
                }
            }
        );

        return { 
            success: true, 
            data: response.data,
            procesado: true
        };

    } catch (error) {
        // Determinar si es un error de timeout
        const esTimeout = error.code === 'ECONNABORTED' || 
                         error.message.includes('timeout');

        if (esTimeout) {
            console.error(`Timeout en marcacion de ${transaccion.emp_code}`);
            return { 
                success: false, 
                error: 'Se excedio el tiempo máximo de espera',
                procesado: false,
                payload: payload
            };
        }

        // Manejar otros tipos de errores
        if (error.response) {
            console.error(`Error ${error.response.status}:`, error.response.data);
            return { 
                success: false, 
                error: error.response.data,
                procesado: false
            };
        } else if (error.request) {
            console.error('Error de conexion:', error.message);
            return { 
                success: false, 
                error: 'Error de conexion',
                procesado: false
            };
        } else {
            console.error('Error:', error.message);
            return { 
                success: false, 
                error: error.message,
                procesado: false
            };
        }
    }
}

// Funcion para enviar marcacion a la API de Proexsi
// Envía la marcación mediante SOAP XML al sistema Proexsi
async function enviarMarcacionAPIProexsi(transaccion) {
    let codigoReloj;
    try {
        // Determinar codigoReloj basado en terminal_sn
        if (transaccion.terminal_sn === 'App') {
            codigoReloj = '999';
        } else {
            // Buscar en la BD el alias del terminal
            const terminalQuery = 'SELECT alias FROM iclock_terminal WHERE sn = $1';
            const terminalResult = await poolIclock.query(terminalQuery, [transaccion.terminal_sn]);
            
            if (terminalResult.rows.length > 0) {
                codigoReloj = terminalResult.rows[0].alias;
            } else {
                console.warn(`No se encontro terminal con sn: ${transaccion.terminal_sn}`);
                codigoReloj = '000'; // Valor por defecto
            }
        }

        // Mapear tipo de marcacion
        let tipo_marcacion = transaccion.punch_state;
        if (transaccion.punch_state === '0') {
            tipo_marcacion = 'C/In';
        } else if (transaccion.punch_state === '1') {
            tipo_marcacion = 'C/Out';
        }

        const periodo = formatearPeriodoAAAAMM(new Date(transaccion.punch_time));
        const fecha = formatearFechaDDMMAAAA(new Date(transaccion.punch_time));
        const hora = formatearFechaHHMM(new Date(transaccion.punch_time));

        // Formatear marcacion según el formato requerido: codigo_empleado fecha hora tipo codigoReloj
        const marcacionFormateada = `${codigoReloj}\t${transaccion.emp_code}\t${fecha}\t${hora}\t${tipo_marcacion}`;
	    

        // Construir SOAP XML
        const soapXml = `<?xml version="1.0" encoding="utf-8"?>
        <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                    xmlns:xsd="http://www.w3.org/2001/XMLSchema"
                    xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
        <soap:Body>
            <CargaMarcacion xmlns="http://tempuri.org/">
            <CodigoUsuario>${process.env.PROEXSI_CODIGO_USUARIO}</CodigoUsuario>
            <Password>${process.env.PROEXSI_PASSWORD}</Password>
            <Periodo>${periodo}</Periodo>
            <Marcaciones>${marcacionFormateada}</Marcaciones>
            </CargaMarcacion>
        </soap:Body>
        </soap:Envelope>`;
        const response = await axiosInstanceProexsi.post(
            process.env.API_URL_PROEXSI,
            soapXml,
            {
                headers: {
                    'Content-Type': 'text/xml; charset=utf-8',
                    'SOAPAction': 'http://tempuri.org/CargaMarcacion'
                }
            }
        );

        // Parsear respuesta SOAP XML
        const responseText = response.data;
        let estado = -1;
        let leidos = null;
        let cargados = null;
        let mensaje = null;

        // Extraer datos de la respuesta SOAP
        try {
            // Buscar el JSON dentro de CargaMarcacionResult
            const jsonMatch = responseText.match(/<CargaMarcacionResult[^>]*>([^<]+)<\/CargaMarcacionResult>/i);
            if (jsonMatch) {
                const jsonData = JSON.parse(jsonMatch[1]);
                estado = Number(jsonData.EstadoMarcacion);
                leidos = Number(jsonData.Leidos);
                cargados = Number(jsonData.Cargados);
                mensaje = jsonData.Mensaje;
            } else {
                console.warn('No se encontro CargaMarcacionResult en la respuesta');
            }
        } catch (parseError) {
            console.error('Error al parsear respuesta SOAP JSON:', parseError);
        }

        return { 
            success: estado === 1,
            data: responseText,
            procesado: estado === 1,
            estadoMarcacion: estado,
            leidos: leidos,
            cargados: cargados,
            mensaje: mensaje
        };

    } catch (error) {
        // Determinar si es un error de timeout
        const esTimeout = error.code === 'ECONNABORTED' || 
                         error.message.includes('timeout');

        if (esTimeout) {
            console.error(`Timeout en marcacion Proexsi de ${transaccion.emp_code}`);
            return { 
                success: false, 
                error: 'Se excedio el tiempo máximo de espera en Proexsi',
                procesado: false
            };
        }

        // Manejar otros tipos de errores
        if (error.response) {
            console.error(`Error Proexsi ${error.response.status}:`, error.response.data);
            return { 
                success: false, 
                error: error.response.data,
                procesado: false
            };
        } else if (error.request) {
            console.error('Error de conexion Proexsi:', error.message);
            return { 
                success: false, 
                error: 'Error de conexion con Proexsi',
                procesado: false
            };
        } else {
            console.error('Error Proexsi:', error.message);
            return { 
                success: false, 
                error: error.message,
                procesado: false
            };
        }
    }
}

// Funcion wrapper para mantener compatibilidad con codigo existente
async function enviarMarcacionAPI(transaccion) {
    // Por ahora mantiene la funcionalidad de Saturno para no romper codigo existente
    return await enviarMarcacionAPISaturno(transaccion);
}

module.exports = {
    obtenerToken,
    obtenerTransaccion,
    enviarMarcacionAPI,
    enviarMarcacionAPISaturno,
    enviarMarcacionAPIProexsi
};  