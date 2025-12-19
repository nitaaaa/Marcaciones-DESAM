-- Tabla para conservar historial completo de errores
-- Esta tabla nunca se modifica ni elimina, solo se insertan nuevos registros

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

