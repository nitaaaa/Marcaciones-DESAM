# Marcaciones-DESAM

Sistema automatizado de notificaciones y envío de marcaciones de asistencia. Este sistema procesa las marcaciones registradas en el sistema iClock y las distribuye mediante correo electrónico y APIs externas (Saturno y Proexsi).

## 📋 Descripción

Este proyecto monitorea continuamente la base de datos de marcaciones y procesa las notificaciones pendientes. Para cada marcación, puede realizar las siguientes operaciones:

- **Envío de correos electrónicos**: Notifica a los funcionarios sobre sus marcaciones de asistencia
- **Integración con API Saturno**: Envía las marcaciones al sistema externo Saturno
- **Integración con API Proexsi**: Envía las marcaciones al sistema externo Proexsi mediante SOAP

El sistema procesa las notificaciones en lotes para optimizar el rendimiento y maneja errores de forma robusta, reintentando operaciones fallidas en la siguiente iteración.

## ✨ Características

- ✅ Procesamiento automático de marcaciones cada 5 segundos
- ✅ Envío de notificaciones por correo electrónico
- ✅ Integración con múltiples APIs externas (Saturno y Proexsi)
- ✅ Procesamiento en lotes para optimizar rendimiento
- ✅ Manejo robusto de errores y timeouts
- ✅ Sistema de reintentos automáticos
- ✅ Configuración mediante variables de entorno
- ✅ Soporte para marcaciones desde App móvil y terminales físicos

## 🛠️ Tecnologías Utilizadas

- **Node.js**: Entorno de ejecución
- **PostgreSQL**: Base de datos para almacenar transacciones
- **Nodemailer**: Envío de correos electrónicos
- **Axios**: Cliente HTTP para APIs
- **dotenv**: Gestión de variables de entorno

## 📦 Requisitos Previos

- Node.js (versión 14 o superior)
- PostgreSQL
- Acceso a la base de datos iClock
- Credenciales para:
  - Servidor SMTP (correo electrónico)
  - API Saturno (opcional)
  - API Proexsi (opcional)

## 🚀 Instalación

1. **Clonar el repositorio**
   ```bash
   git clone https://github.com/nitaaaa/Marcaciones-DESAM.git
   cd Marcaciones-DESAM
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   
   Crear un archivo `.env` en la raíz del proyecto con las siguientes variables:

   ```env
   # Base de datos iClock
   DB_ICLOCK_HOST=localhost
   DB_ICLOCK_USER=postgres
   DB_ICLOCK_PASSWORD=tu_password
   DB_ICLOCK_DATABASE=biotime
   DB_ICLOCK_PORT=7496

   # API Principal (opcional)
   API_URL=https://tu-api-url.com
   API_USERNAME=tu_usuario
   API_PASSWORD=tu_password
   API_ENDPOINT_TOKEN=/jwt-api-token-auth/

   # API Saturno (opcional)
   API_URL_SATURNO=https://api-saturno-url.com/
   X_API_KEY=tu_api_key
   X_API_SECRET=tu_api_secret

   # API Proexsi (opcional)
   API_URL_PROEXSI=https://api-proexsi-url.com
   PROEXSI_CODIGO_USUARIO=tu_codigo_usuario
   PROEXSI_PASSWORD=tu_password

   # Configuración de Email
   EMAIL_HOST=smtp-mail.outlook.com
   EMAIL_PORT=587
   EMAIL_USER=tu_email@dominio.com
   EMAIL_PASS=tu_password_email
   EMAIL_FROM=tu_email@dominio.com
   EMAIL_TIMEOUT_CONNECTION=30000
   EMAIL_TIMEOUT_GREETING=30000
   EMAIL_TIMEOUT_SOCKET=60000
   EMAIL_TIMEOUT_COMMAND=30000
   ```

## ▶️ Uso

### Ejecutar la aplicación

```bash
node app.js
```

La aplicación se ejecutará en un bucle infinito, consultando notificaciones pendientes cada 5 segundos.

### Detener la aplicación

Presiona `Ctrl + C` para detener la aplicación de forma segura. El sistema cerrará las conexiones a la base de datos antes de finalizar.

## 📁 Estructura del Proyecto

```
Marcaciones-DESAM/
├── app.js                      # Archivo principal de la aplicación
├── emailMessageBuilder.js      # Constructor de mensajes de correo
├── package.json                # Dependencias del proyecto
├── .env                        # Variables de entorno (no se sube al repositorio)
├── .gitignore                  # Archivos ignorados por Git
├── assets/
│   └── logo1.png              # Logo para los correos
├── services/
│   ├── apiService.js          # Servicios para APIs externas
│   └── emailService.js        # Servicio de envío de correos
└── utils/
    ├── dateUtils.js           # Utilidades para formateo de fechas
    └── rutUtils.js            # Utilidades para validación de RUT
```

## ⚙️ Configuración

### Base de Datos

El sistema requiere acceso a una base de datos PostgreSQL con las siguientes tablas:
- `iclock_transaction`: Transacciones de marcaciones
- `notificaciones_pendientes`: Notificaciones pendientes de procesar
- `notificacion_operaciones`: Registro de operaciones completadas
- `personnel_employee`: Información de empleados
- `personnel_area`: Áreas/establecimientos
- `notification_settings`: Configuración de notificaciones por área
- `iclock_terminal`: Terminales de marcación

### Configuración de Notificaciones

Las notificaciones se configuran por área mediante la tabla `notification_settings`:
- `email`: Habilitar/deshabilitar envío de correos
- `api`: Habilitar/deshabilitar envío a API Saturno
- `api_proexsi`: Habilitar/deshabilitar envío a API Proexsi

### Procesamiento de Marcaciones

- El sistema procesa marcaciones en lotes de 40 para optimizar el rendimiento
- Solo procesa marcaciones con `punch_state` "0" (entrada) o "1" (salida) para Proexsi
- Las marcaciones desde App móvil (`terminal_sn = 'App'`) siempre generan notificaciones por correo

## 🔒 Seguridad

- ⚠️ **Nunca subas el archivo `.env` al repositorio**
- ⚠️ **Cambia todas las credenciales por defecto**
- ⚠️ **Mantén el archivo `.env` fuera del control de versiones**

El archivo `.gitignore` ya está configurado para ignorar archivos sensibles.

## 📝 Logs

El sistema registra información en la consola sobre:
- Notificaciones pendientes encontradas
- Operaciones completadas exitosamente
- Errores y timeouts
- Operaciones pendientes de reintento

## 🐛 Solución de Problemas

### Error de conexión a la base de datos
- Verifica que PostgreSQL esté ejecutándose
- Confirma que las credenciales en `.env` sean correctas
- Verifica que el puerto y host sean accesibles

### Error al enviar correos
- Verifica las credenciales SMTP
- Confirma que el servidor SMTP esté accesible
- Revisa los timeouts configurados

### Error en APIs externas
- Verifica las URLs y credenciales de las APIs
- Confirma que los servicios externos estén disponibles
- Revisa los logs para más detalles del error

## 📄 Licencia

ISC

## 👥 Autor

Municipalidad Puerto Montt - DESAM

## 📞 Soporte

Para problemas o consultas, contacta al equipo de desarrollo.
