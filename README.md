# Programacion-Script-de-arqueo-de-caja

## 📄 Abstract del Proyecto
**POS Electroavila V3** es un sistema inteligente de punto de venta (POS) y reconciliación de efectivo diseñado bajo una arquitectura de nube híbrida utilizando **Google Sheets** como motor de base de datos relacional, **Google Apps Script** como núcleo de procesamiento lógico y automatización, y **AppSheet** como interfaz de usuario móvil/web. El sistema automatiza el control de ingresos, calcula y redondea el cambio comercial, valida en tiempo real la disponibilidad física de billetes y monedas en la gaveta y gestiona de forma autónoma el estado operativo de las transacciones.

---
## 🛠️ Descripción Larga
El sistema opera sobre dos tablas principales interconectadas:
1. **`Ventas`**: Registra las transacciones comerciales, almacenando los medios de pago, el efectivo recibido desglosado por denominaciones (`cant_...`), el cambio calculado y el desglose óptimo de salida (`Dev_...`).
2. **`Arqueo_caja`**: Funciona como el inventario centralizado y global del efectivo disponible en caja.

---
### Flujo de Negocio y Lógica de Operación:
* **Detección y Disparadores**: El motor se activa de manera automática mediante un trigger `onEdit` al modificarse el estado de una venta, o de forma manual a través de la función de auditoría (`probarManual` utilizando la vista `Filtro_caja_2`).
* **Cálculo Comercial**: Procesa el efectivo de entrada validando los billetes ingresados o el monto registrado, aplicando un redondeo comercial estricto a la centena superior (`Math.ceil`).
* **Desglose de Vueltos**: Calcula el desglose óptimo de billetes y monedas necesarios para entregar el cambio exacto al cliente.
* **Reconciliación Atómica**: Si la caja cuenta con el stock necesario, el script actualiza automáticamente la tabla `Arqueo_caja` restando las denominaciones entregadas (`Dev_...`) y sumando las ingresadas (`cant_...`).
* **Manejo de Errores y Alertas Inteligentes**: Si la gaveta no cuenta con el efectivo suficiente para cubrir los vueltos, el sistema frena la operación, evita desajustes contables, revierte automáticamente el estado de la venta a **"Pendiente"** y genera una alerta descriptiva detallando el faltante exacto en dinero y las denominaciones específicas requeridas, formateando la celda de `Observaciones` en **negrita y color rojo**.

---
## 🚀 Estado Detallado de los Logros (10 de Noviembre de 2026)

Durante la sesión de desarrollo e ingeniería de hoy, se consolidaron las siguientes mejoras críticas en el núcleo del sistema:

* **✅ Alerta Inteligente de Faltantes en Caja**: 
  * Se implementó una rutina de simulación previa que calcula no solo si hay déficit, sino también el valor monetario exacto del faltante total para la transacción.
  * El sistema ahora genera un desglose textual en la alerta que indica al cajero la cantidad exacta y la denominación específica de los billetes o monedas que faltan en la gaveta (ej. unidades faltantes de billetes de 10k, monedas de 500m, etc.).
* **✅ Blindaje y Reversión Automática de Estados**: 
  * Se configuró la lógica para que, ante cualquier insuficiencia de efectivo en caja, el campo `Estado` de la venta regrese de forma automática a **"Pendiente"**, evitando que transacciones incompletas o erróneas avancen en el flujo operativo.
* **✅ Formato Visual Dinámico (`Observaciones`)**: 
  * Integración de estilos programáticos para que los mensajes de error y las instrucciones de reintento aparezcan automáticamente con formato de **texto en negrita y color rojo brillante**, facilitando la identificación visual inmediata para el operador.
* **✅ Robustez en el Manejo de Columnas**: 
  * Consolidación de la función auxiliar `buscarIndiceColumna`, asegurando una lectura y escritura tolerante a espacios, mayúsculas o variaciones menores en los encabezados de las hojas `Ventas` y `Arqueo_caja`.
* **✅ Establecimiento de Punto de Restauración (V1.0)**: 
  * Validado y probado con éxito el ciclo completo de procesamiento manual y automático, asegurando estabilidad para la integración definitiva en el ecosistema de producción.
