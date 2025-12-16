function formatearFecha(fecha) {
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const hours = String(fecha.getHours()).padStart(2, '0');
    const minutes = String(fecha.getMinutes()).padStart(2, '0');
    const seconds = String(fecha.getSeconds()).padStart(2, '0');
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatearFechaDDMMAAAA(fechaString) {
    const fecha = new Date(fechaString);
    const day = String(fecha.getDate()).padStart(2, '0');
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const year = fecha.getFullYear();
    
    return `${day}-${month}-${year}`;
}

function calcularRangoFechas(intervalo) {
    const ahora = new Date(new Date().getTime() - 20 * 1000); 
    const fechaInicio = new Date(ahora.getTime() - intervalo);
    return {
        inicio: formatearFecha(fechaInicio), //El inicio es el fin menos un intervalo
        fin: formatearFecha(ahora) //El fin es el ahora menos 20 segundos
    };
}

function formatearHoraHHMMSS(fechaString) {
    const fecha = new Date(fechaString);
    const hours = String(fecha.getHours()).padStart(2, '0');
    const minutes = String(fecha.getMinutes()).padStart(2, '0');
    const seconds = String(fecha.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function formatearFechaHHMM(fechaString) {
    const fecha = new Date(fechaString);
    const hours = String(fecha.getHours()).padStart(2, '0');
    const minutes = String(fecha.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

// AAAAMM como string (p.ej. "202510")
function formatearPeriodoAAAAMM(fechaInput) {
    const fecha = new Date(fechaInput);
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    return `${year}${month}`;
}

module.exports = {
    formatearFecha,
    calcularRangoFechas,
    formatearFechaDDMMAAAA,
    formatearHoraHHMMSS,
    formatearFechaHHMM,
    formatearPeriodoAAAAMM
}; 