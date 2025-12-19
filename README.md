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

   # API ZKTeco (opcional)
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
   
   # Correo para alertas de bloqueo
   EMAIL_ALERTA=informatica@saludpm.cl
   ```

## ▶️ Uso

### Ejecutar la aplicación

```bash
node app.js
```

La aplicación se ejecutará en un bucle infinito, consultando notificaciones pendientes cada 5 segundos.

### Detener la aplicación

Presiona `Ctrl + C` para detener la aplicación de forma segura. El sistema cerrará las conexiones a la base de datos antes de finalizar.

### Desbloquear operaciones bloqueadas de Proexsi

Si una operación de Proexsi se bloquea después de 3 fallos consecutivos, puedes desbloquearla manualmente usando el script `desbloquear-proexsi.js`:

**Desbloquear una transacción específica:**
```bash
node desbloquear-proexsi.js --transaccion 12345
```

**Desbloquear todas las operaciones bloqueadas:**
```bash
node desbloquear-proexsi.js --todas
```

El script resetea el contador de intentos y limpia el flag de bloqueo, permitiendo que el sistema reintente los envíos. El historial completo de errores se conserva en la tabla `notificacion_errores`.

## 📁 Estructura del Proyecto

```
Marcaciones-DESAM/
├── app.js                      # Archivo principal de la aplicación
├── emailMessageBuilder.js      # Constructor de mensajes de correo
├── desbloquear-proexsi.js     # Script para desbloquear operaciones bloqueadas
├── package.json                # Dependencias del proyecto
├── .env                        # Variables de entorno (no se sube al repositorio)
├── .gitignore                  # Archivos ignorados por Git
├── assets/
│   └── logo1.png              # Logo para los correos
├── services/
│   ├── apiService.js          # Servicios para APIs externas
│   └── emailService.js        # Servicio de envío de correos
├── sql/
│   └── crear_tabla_notificacion_errores.sql  # SQL para crear tabla de historial de errores
└── utils/
    ├── dateUtils.js           # Utilidades para formateo de fechas
    └── rutUtils.js            # Utilidades para validación de RUT
```

## ⚙️ Configuración

### Base de Datos

El programa se conecta a la base de datos PostgreSQL del sistema de asistencia ZKTeco (Biotime).  
Sobre esa base de datos ya existente se realizan las siguientes **modificaciones** para que la aplicación funcione:

- `notificaciones_pendientes`: Tabla nueva donde se registran las marcaciones pendientes de procesar
- `notificacion_operaciones`: Tabla nueva donde se registra el estado de cada operación realizada sobre una marcación (email, APIs, etc.)
- `notificacion_errores`: Tabla nueva donde se conserva el historial completo de errores (nunca se elimina)
- `notification_settings`: Tabla nueva donde se configura, por área (`personnel_area`), qué tipos de notificación se deben ejecutar

#### SQL para crear tablas, función y trigger

Ejecutar el siguiente SQL sobre la base de datos de ZKTeco para preparar el entorno:

```sql
-- 1) Tabla notificaciones_pendientes
CREATE TABLE public.notificaciones_pendientes (
    iclock_transaction_id integer NOT NULL,
    procesado boolean NOT NULL DEFAULT false,
    CONSTRAINT notificaciones_pendientes_pkey PRIMARY KEY (iclock_transaction_id),
    CONSTRAINT notificaciones_pendientes_iclock_transaction_fk
        FOREIGN KEY (iclock_transaction_id)
        REFERENCES public.iclock_transaction (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- 2) Tabla notificacion_operaciones
CREATE TABLE public.notificacion_operaciones (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    iclock_transaction_id integer NOT NULL,
    operacion character varying(50) NOT NULL,
    completada boolean NOT NULL DEFAULT false,
    error_mensaje text,
    intentos integer NOT NULL DEFAULT 0,
    CONSTRAINT notificacion_operaciones_iclock_transaction_fk
        FOREIGN KEY (iclock_transaction_id)
        REFERENCES public.iclock_transaction (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE,
    CONSTRAINT notificacion_operaciones_unique_tx_operacion
        UNIQUE (iclock_transaction_id, operacion)
);

-- 3) Tabla notificacion_errores (historial completo de errores)
CREATE TABLE IF NOT EXISTS public.notificacion_errores (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    iclock_transaction_id integer NOT NULL,
    operacion character varying(50) NOT NULL,
    error_mensaje text NOT NULL,
    fecha_error timestamp NOT NULL DEFAULT NOW(),
    CONSTRAINT notificacion_errores_iclock_transaction_fk
        FOREIGN KEY (iclock_transaction_id)
        REFERENCES public.iclock_transaction (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notificacion_errores_transaccion_operacion 
ON public.notificacion_errores(iclock_transaction_id, operacion);

-- 4) Tabla notification_settings
CREATE TABLE public.notification_settings (
    personnel_area_id integer NOT NULL,
    email boolean NOT NULL DEFAULT false,
    api boolean NOT NULL DEFAULT false,
    api_proexsi boolean NOT NULL DEFAULT false,
    CONSTRAINT notification_settings_pkey PRIMARY KEY (personnel_area_id),
    CONSTRAINT notification_settings_personnel_area_fk
        FOREIGN KEY (personnel_area_id)
        REFERENCES public.personnel_area (id)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- 5) Función registrar_notificacion()
CREATE OR REPLACE FUNCTION public.registrar_notificacion()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    INSERT INTO public.notificaciones_pendientes (iclock_transaction_id, procesado)
    VALUES (NEW.id, FALSE);

    RETURN NEW;
END;
$function$;

-- 6) Trigger en iclock_transaction
CREATE TRIGGER trg_registrar_notificacion_iclock
AFTER INSERT ON public.iclock_transaction
FOR EACH ROW
EXECUTE FUNCTION public.registrar_notificacion();
```

### Configuración de Notificaciones

Las notificaciones se configuran **por área** (`personnel_area`) mediante la tabla `notification_settings`.  
Cada fila de esta tabla le indica al programa qué acciones debe ejecutar para las marcaciones de esa área específica:
- `email`: Habilitar/deshabilitar envío de correos para esa área
- `api`: Habilitar/deshabilitar envío de marcaciones a la API Saturno
- `api_proexsi`: Habilitar/deshabilitar envío de marcaciones a la API Proexsi

Si para un área **todos estos campos están en `false`**, las marcaciones asociadas a esa área **no generarán ningún envío**, es decir:  
no se enviarán correos ni se enviará información a ninguna API externa.

### Procesamiento de Marcaciones

- El sistema procesa marcaciones en lotes de 40 para optimizar el rendimiento
- Solo procesa marcaciones con `punch_state` "0" (entrada) o "1" (salida) para Proexsi
- Las marcaciones desde App móvil (`terminal_sn = 'App'`) siempre generan notificaciones por correo

### Sistema de Bloqueo Automático para Proexsi

El sistema incluye protección contra acumulación de errores en Proexsi:

- **Bloqueo automático**: Si una operación falla 3 veces consecutivas, se bloquea automáticamente
- **Alerta por correo**: Cuando se bloquea una operación, se envía un correo de alerta al correo configurado en `EMAIL_ALERTA`
- **Historial de errores**: Todos los errores se guardan en la tabla `notificacion_errores` para análisis posterior
- **Desbloqueo manual**: Puedes desbloquear operaciones usando el script `desbloquear-proexsi.js`

**Importante**: Una vez bloqueada, la operación no se reintentará automáticamente hasta que se desbloquee manualmente. Esto previene que el servidor de Proexsi detecte múltiples intentos fallidos como un ataque DDoS.


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

Jorge Grez González

## 📞 Soporte

Para problemas o consultas, contacta a oficina de informatica DESAM Puerto Montt informatica@saludpm.cl
