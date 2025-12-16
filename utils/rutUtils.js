/**
 * Calcula el dígito verificador de un RUT chileno
 * @param {string|number} rut - El RUT sin dígito verificador
 * @returns {string} El dígito verificador calculado
 */
function calcularDigitoVerificador(rut) {
    // Convertir a string y eliminar caracteres no numéricos
    rut = rut.toString().replace(/[^0-9kK]/g, '');
    
    // Verificar que el RUT tenga al menos 1 dígito
    if (rut.length === 0) {
        throw new Error('El RUT no puede estar vacío');
    }

    // Calcular el dígito verificador
    let suma = 0;
    let multiplicador = 2;

    // Recorrer el RUT de derecha a izquierda
    for (let i = rut.length - 1; i >= 0; i--) {
        suma += parseInt(rut.charAt(i)) * multiplicador;
        multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
    }

    // Calcular el dígito verificador
    const resto = suma % 11;
    const dv = 11 - resto;

    // Si el resultado es 11, el dígito verificador es 0
    // Si el resultado es 10, el dígito verificador es K
    return dv === 11 ? '0' : dv === 10 ? 'K' : dv.toString();
}

module.exports = {
    calcularDigitoVerificador
}; 