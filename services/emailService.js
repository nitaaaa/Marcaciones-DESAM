require('dotenv').config();

const nodemailer = require('nodemailer');
const path = require('path');

// Configura el transportador de correo
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    // Configuración del pool
    pool: true,                    // Habilitar pool
    maxConnections: 3,             // Máximo 3 conexiones simultáneas
    maxMessages: 500,              // Reciclar conexión después de 500 mensajes
    // Configuración de timeout desde variables de entorno
    connectionTimeout: parseInt(process.env.EMAIL_TIMEOUT_CONNECTION) || 30000,      // 30 segundos para establecer conexión
    greetingTimeout: parseInt(process.env.EMAIL_TIMEOUT_GREETING) || 30000,          // 30 segundos para saludo SMTP
    socketTimeout: parseInt(process.env.EMAIL_TIMEOUT_SOCKET) || 60000,              // 60 segundos para operaciones de socket
    commandTimeout: parseInt(process.env.EMAIL_TIMEOUT_COMMAND) || 30000,            // 30 segundos para comandos SMTP
});

// Función para enviar correo con timeout y sin reintentos
async function sendEmail(to, subject, { text, html }) {
    try {
        
        const info = await transporter.sendMail({
            from: process.env.EMAIL_FROM,
            to,
            subject,
            text,
            html,
            attachments: [
                {
                    filename: 'logo1.png',
                    path: path.join(__dirname, '../assets/logo1.png'),
                    cid: 'logo1'
                }
            ]
        });
        return true;
        
    } catch (error) {
        console.error(`Error al enviar correo a: ${to}`);
        console.error('Codigo de error:', error.code);
        console.error('Mensaje de error:', error.message);
        
        // Verificar si es un error de timeout
        if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT' || 
            error.message.includes('timeout') || error.message.includes('timed out')) {
            console.error('Error de timeout');
        }
        
        // Verificar otros tipos de errores comunes
        if (error.code === 'ECONNREFUSED') {
            console.error('Conexion rechazada');
        }
        
        if (error.code === 'EAUTH') {
            console.error('Error de autenticacion');
        }
        
        console.error('Respuesta del servidor:', error.response);
        
        // Retornar false en lugar de lanzar el error para evitar reintentos
        return false;
    }
}
module.exports = sendEmail; 