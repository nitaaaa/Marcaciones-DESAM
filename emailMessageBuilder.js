const { formatearFechaDDMMAAAA, formatearHoraHHMMSS } = require('./utils/dateUtils');
const { calcularDigitoVerificador } = require('./utils/rutUtils');

function determinarTipoMarcacion(punchState) {
    switch(punchState) {
        case '0':
            return 'Entrada';
        case '1':
            return 'Salida';
        default:
            return punchState;
    }
}

function obtenerNombreArea(areaAlias) {
    if (areaAlias === '' || areaAlias === null) {
        return 'App movil';
    }
    return areaAlias;  
}

function construirMensaje(transaccion) {
    const tipoMarcacion = determinarTipoMarcacion(transaccion.punch_state);
    const fechaFormateada = formatearFechaDDMMAAAA(transaccion.punch_time);
    const horaFormateada = formatearHoraHHMMSS(transaccion.punch_time);
    const areaAlias = obtenerNombreArea(transaccion.area_alias);
    const rutCompleto = transaccion.emp_code + "-" + calcularDigitoVerificador(transaccion.emp_code);

    return {
        text: `Estimado/a ${transaccion.first_name} ${transaccion.last_name},\n\n` +
              `RUT: ${rutCompleto}\n\n` +
              `Se ha registrado su marcación de asistencia:\n` +
              `Fecha: ${fechaFormateada}\n` +
              `Hora: ${horaFormateada}\n` +
              `Tipo: ${tipoMarcacion}\n` +
              `Área: ${areaAlias}\n\n` +
              `Saludos cordiales.`,
        html: `
            <div style="font-family: Arial, sans-serif;">
                <p>Estimado/a ${transaccion.first_name} ${transaccion.last_name},</p>
                <p>RUT: ${rutCompleto}</p>
                <p>Se ha registrado su marcación de asistencia:</p>
                <ul>
                    <li><strong>Fecha:</strong> ${fechaFormateada}</li>
                    <li><strong>Hora:</strong> ${horaFormateada}</li>
                    <li><strong>Tipo:</strong> ${tipoMarcacion}</li>
                    <li><strong>Establecimiento:</strong> ${areaAlias}</li>
                </ul>
                <p>Saludos cordiales.</p>
                <div>
                    <img src="cid:logo1" alt="Logo 1" style="height: 200px; margin-right: 10px;"/>
                </div>
            </div>
        `
    };
}

module.exports = {
    construirMensaje
}; 