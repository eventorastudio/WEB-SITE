# Manual operativo fiscal — Eventora Studio

Documento interno. Actualización intermedia: 1 de septiembre de 2026. No contiene secretos ni sustituye instrucciones del contador.

## 1. Marco fiscal y precios

La operación se estructura bajo RESICO para persona física según la situación fiscal vigente registrada ante el SAT. El servicio está gravado con IVA general del 16%. Los precios públicos deben representar el total a desembolsar con impuestos aplicables incluidos:

- Esencial: desde $349 MXN.
- Premium: desde $649 MXN.
- Prestige: desde $849 MXN.

El “Desde” sólo debe usarse si el precio base está realmente disponible. La cotización interna debe separar paquete, extras, subtotal, IVA y total.

## 2. Flujo administrativo

1. Registrar cotización con paquete, extras, subtotal, IVA y total.
2. Conservar aceptación y orden de compra mediante mensajes de datos atribuibles al cliente.
3. Registrar el pago y emitir un comprobante comercial con folio, fecha, servicio y total.
4. Usar la leyenda: “Este documento no sustituye un CFDI. El comprobante fiscal correspondiente podrá solicitarse proporcionando los datos fiscales requeridos por la normativa aplicable.”

## 3. CFDI individual

La facturación inicial es manual y administrativa. No existe portal web ni automatización Mercado Pago-SAT. Si el cliente solicita CFDI, pedir sólo los datos fiscales aplicables: RFC, nombre o razón social, código postal fiscal, régimen fiscal y uso de CFDI. La Constancia de Situación Fiscal puede recibirse voluntariamente para facilitar la captura, pero no es requisito obligatorio. No publicar plazos inventados ni pérdida automática del derecho a CFDI.

## 4. CFDI global y cobros

Las operaciones sin CFDI individual se controlarán internamente para su inclusión en el CFDI global que corresponda conforme al procedimiento y periodicidad aplicables. El ingreso de Mercado Pago se registra por el monto bruto cobrado; la comisión se concilia por separado y no se hardcodea un porcentaje. En RESICO PF la comisión no reduce la base de ISR; el IVA de la comisión se analiza conforme al CFDI y reglas de acreditamiento aplicables.

Si se paga el 100% y corresponde fiscalmente, usar PUE. Para SPEI, usar forma de pago 03 cuando corresponda. Si el precio y servicio están definidos y se paga en parcialidades, tratarlo como PPD, forma 99 y emitir complementos de recepción de pagos cuando corresponda. Un esquema 50/50 no se llama “anticipo” automáticamente.

## 5. Reembolsos y conservación

La política comercial objetivo distribuye económicamente el servicio en 15% para configuración inicial, 55% para diseño y personalización, y 30% para publicación y operación. Esta distribución no constituye una obligación legal ni implica que iniciar una etapa elimine automáticamente un derecho o porcentaje. Los efectos dependen del trabajo efectivamente ejecutado, la contratación aplicable y los derechos irrenunciables del consumidor. Cuando corresponda el artículo 56 LFPC, se respetará su régimen. Los reembolsos procedentes se procesarán dentro de un máximo comercial de siete días hábiles desde la confirmación de su procedencia; la acreditación posterior puede depender de la institución financiera o proveedor de pagos.

Registrar solicitud, fecha, causa, etapa del servicio, monto, medio original y resolución. Un reembolso o reducción de un servicio ya facturado puede requerir CFDI de egreso o nota de crédito conforme corresponda; no aplicar automáticamente relación 03. La relación 01 podrá utilizarse cuando proceda para documentos relacionados. Distinguir esto de la cancelación de un CFDI cuando la operación finalmente no se realizó.

Conservar cotizaciones, aceptación, comprobantes, pagos, CFDI, cancelaciones y reembolsos durante los periodos fiscales, contractuales y de defensa de derechos aplicables. Mantener separación bancaria recomendada para la operación. No registrar aquí RFC real, contraseñas, e.firma, archivos .key/.cer, CSF ni datos bancarios.
