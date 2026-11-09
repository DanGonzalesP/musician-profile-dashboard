# Correo de acceso de Vibe

Preparación del 6 de noviembre de 2026. No hay envío real, activación SMTP ni
dominio comprado. El cierre21 continúa pendiente de entrega y enlaces reales.

## Archivos para instalar

| Plantilla de Supabase | Archivo | Asunto propuesto |
|---|---|---|
| Confirm sign up | `supabase/templates/confirmation.html` | Confirma tu correo en Vibe |
| Reset password | `supabase/templates/recovery.html` | Recupera tu acceso a Vibe |
| Change email address | `supabase/templates/email-change.html` | Confirma el cambio de correo en Vibe |

HTML autónomo, en español, sin imágenes remotas, seguimiento, datos personales
incrustados ni dominio inventado. Mantiene `{{ .ConfirmationURL }}` para que
Supabase genere el enlace de verificación. No sustituirlo por un enlace directo
a login o nueva-contrasena: esas páginas por sí solas no verifican el correo.

## Destino y configuración

1. Confirmar proyecto **Vibe Music**, referencia **yiexwdqgaqoqlfqihsfr** y cuenta
   empresarial antes de escribir. Conservar configuración anterior para rollback
   privado, sin exportar claves al repositorio o al chat.
2. Cuando se elija dominio, alinear Site URL de Supabase con NEXT_PUBLIC_SITE_URL
   del Worker. Agregar retornos exactos `/login` y `/nueva-contrasena` para cada
   origen autorizado de producción/staging. No usar comodines generales.
3. Instalar los tres cuerpos/asuntos en Authentication → Email Templates.
   No modificar otros tipos de correo ni desactivar la doble confirmación de
   cambio de dirección. Revisar si el plan/configuración actual permite las
   plantillas: no contratar un plan ni SMTP automáticamente.
4. Remitente, dominio verificado, SPF/DKIM/DMARC y SMTP siguen pendientes de
   elección/configuración. La cuenta empresarial de Google no se asume como
   servicio SMTP transaccional. No añadir otro proveedor sin decisión del titular.
5. Desactivar seguimiento de enlaces en el remitente si existiera: puede alterar
   las URLs de autenticación. La plantilla no incluye seguimiento propio.

El registro y el reenvío retornan a `/login`; la recuperación retorna a
`/nueva-contrasena`. `/confirmar-correo` permite solicitar un nuevo enlace sin
contraseña, con mensaje uniforme incluso ante error y pausa local de60s. El
límite real corresponde a Supabase; el temporizador no impide abuso por API.

## Desarrollo local

config.toml ahora incluye retornos exactos de login/recuperación en3000 y3070.
No se reinició Auth: la lista nueva debe cargarse en la siguiente ventana local
de mantenimiento. El cambio no demuestra que el servicio activo ya la use.
La vista3070 debe iniciarse con NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3070.
No cambiar enable_confirmations=false del entorno de pruebas para simular
producción: la aceptación de correos debe usar un entorno separado con buzón.

Las plantillas se entregan como archivos para instalar; todavía no están
referenciadas en config.toml ni instaladas en el proyecto remoto. Al habilitarlas
localmente, copiar también templates/ en cualquier directorio aislado que use
config.toml: el actualizador de migraciones sólo copia configuración y SQL.

## Aceptación final pendiente

- Buzón de prueba autorizado: confirmación, enlace caducado/reutilizado, reenvío,
  recuperación y doble confirmación de cambio; no enviar a terceros.
- Cuenta inexistente/confirmada, error y límite deben conservar respuesta
  pública uniforme; comprobar teclado, foco y lectores de pantalla.
- Navegador original y distinto, código PKCE/enlace de recuperación, sesión
  existente y cambio de cuenta. No declarar válido el flujo sólo por recibir mail.
- Escáner de seguridad de correo: puede consumir un enlace de un solo uso.
  Si ocurre, implementar y validar confirmación explícita antes del canje u OTP;
  estas plantillas todavía no resuelven ese caso.
- Revisar aspecto móvil/escritorio, entrega/spam y autenticación del remitente.

Fuentes oficiales consultadas:
[plantillas y límites de enlaces](https://supabase.com/docs/guides/auth/auth-email-templates),
[configuración local](https://supabase.com/docs/guides/local-development/customizing-email-templates).
