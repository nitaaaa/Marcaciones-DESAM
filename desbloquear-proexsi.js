require('dotenv').config();

const { Pool } = require('pg');

// Configuracion de la conexion a PostgreSQL usando variables de entorno
const poolIclock = new Pool({
  host: process.env.DB_ICLOCK_HOST,
  user: process.env.DB_ICLOCK_USER,
  password: process.env.DB_ICLOCK_PASSWORD,
  database: process.env.DB_ICLOCK_DATABASE,
  port: parseInt(process.env.DB_ICLOCK_PORT) || 5432
});

// Funcion para desbloquear una transaccion especifica
async function desbloquearTransaccion(transactionId) {
  try {
    // Verificar que la transaccion exista
    const checkResult = await poolIclock.query(
      'SELECT id FROM iclock_transaction WHERE id = $1',
      [transactionId]
    );
    
    if (checkResult.rows.length === 0) {
      console.error(`Error: No se encontró la transacción con ID ${transactionId}`);
      return 0;
    }
    
    // Desbloquear: limpiar error_mensaje y resetear intentos a 0
    const result = await poolIclock.query(
      `UPDATE notificacion_operaciones 
       SET error_mensaje = NULL, intentos = 0 
       WHERE iclock_transaction_id = $1 
       AND operacion = 'api_proexsi' 
       AND (error_mensaje LIKE 'BLOQUEADO%' OR intentos >= 3)`,
      [transactionId]
    );
    
    if (result.rowCount > 0) {
      console.log(`✓ Transacción ${transactionId} desbloqueada exitosamente`);
    } else {
      console.log(`ℹ Transacción ${transactionId} no estaba bloqueada o no tiene operación api_proexsi`);
    }
    
    return result.rowCount;
  } catch (error) {
    console.error(`Error al desbloquear transacción ${transactionId}:`, error);
    throw error;
  }
}

// Funcion para desbloquear todas las operaciones bloqueadas de Proexsi
async function desbloquearTodas() {
  try {
    const result = await poolIclock.query(
      `UPDATE notificacion_operaciones 
       SET error_mensaje = NULL, intentos = 0 
       WHERE operacion = 'api_proexsi' 
       AND (error_mensaje LIKE 'BLOQUEADO%' OR intentos >= 3)`
    );
    
    console.log(`✓ ${result.rowCount} operación(es) desbloqueada(s) exitosamente`);
    return result.rowCount;
  } catch (error) {
    console.error('Error al desbloquear todas las operaciones:', error);
    throw error;
  }
}

// Funcion principal
async function main() {
  const args = process.argv.slice(2);
  
  // Verificar argumentos
  if (args.length === 0) {
    console.log('Uso:');
    console.log('  node desbloquear-proexsi.js --transaccion <ID>  - Desbloquear una transacción específica');
    console.log('  node desbloquear-proexsi.js --todas            - Desbloquear todas las operaciones bloqueadas');
    process.exit(1);
  }
  
  try {
    if (args[0] === '--transaccion') {
      if (!args[1]) {
        console.error('Error: Debe proporcionar un ID de transacción');
        console.log('Uso: node desbloquear-proexsi.js --transaccion <ID>');
        process.exit(1);
      }
      
      const transactionId = parseInt(args[1]);
      if (isNaN(transactionId)) {
        console.error(`Error: "${args[1]}" no es un ID de transacción válido`);
        process.exit(1);
      }
      
      await desbloquearTransaccion(transactionId);
      
    } else if (args[0] === '--todas') {
      const cantidad = await desbloquearTodas();
      if (cantidad === 0) {
        console.log('ℹ No se encontraron operaciones bloqueadas');
      }
      
    } else {
      console.error(`Error: Opción desconocida "${args[0]}"`);
      console.log('Uso:');
      console.log('  node desbloquear-proexsi.js --transaccion <ID>');
      console.log('  node desbloquear-proexsi.js --todas');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('Error fatal:', error);
    process.exit(1);
  } finally {
    await poolIclock.end();
  }
}

// Ejecutar
main();

