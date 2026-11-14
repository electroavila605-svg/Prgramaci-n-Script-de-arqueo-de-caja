Este es el último córigo creado con claude el 14 de noviembre  a las 5 pm, el estado es más o menos funcioanl pero todavía
necesita refinarse

Además se determinó que para que el sistema funcione deben crearse en la tabla ventas dos columnas de control de modificación de la
fila correspondiente al Id_venta que estamos modificando:
1. Columna de "Fecha_modificación"
2. Columna de "Hora_modificiación"

Estas dos columnas son las que nos van a ayudar a tener control sobre la ejecución de las pruebas y verificar si el log coincide con
esas columnas.

SCRIPT MODIFICADO VERSIÓN 2.0 

/**
 * ARQUEO DE CAJA - V2.0 (script limpio, un solo archivo)
 *
 * FLUJO
 *  1. El cajero pulsa "Pagar" en AppSheet y el Estado pasa a "Pagado".
 *  2. El bot de AppSheet llama por webhook (POST) a doPost con { "Id_Venta": "..." }.
 *  3. Si el pago es en efectivo, se calcula el vuelto con los billetes y monedas de
 *     Arqueo_caja MAS lo que el cliente acaba de entregar (columnas cant_...).
 *  4a. Si alcanza: se escriben las columnas Dev_..., se actualiza Arqueo_caja
 *      y se limpia Observaciones.
 *  4b. Si NO alcanza: Observaciones muestra la alerta en rojo y Estado vuelve a "Pendiente".
 *
 * PRUEBAS (se ejecutan desde el editor, eligiendo la funcion en el menu desplegable):
 *  - revisarEstructura : verifica hojas y nombres de columnas
 *  - pruebaFila2       : procesa la venta de la fila 2 de Ventas, sin AppSheet
 *  - probarWebhook     : llama a la URL publicada como lo hace AppSheet
 *  Los resultados quedan en la hoja "Log".
 */

// ===================== CONFIGURACION =====================
var HOJA_VENTAS = "Ventas";
var HOJA_ARQUEO = "Arqueo_caja";
var HOJA_LOG = "Log";
var FILA_ARQUEO = 2; // fila de Arqueo_caja donde esta el stock actual

// De mayor a menor. Las columnas se llaman "cant_" + sufijo y "Dev_" + sufijo.
var DENOMS = [
  { valor: 100000, sufijo: "100k" },
  { valor: 50000, sufijo: "50k" },
  { valor: 20000, sufijo: "20k" },
  { valor: 10000, sufijo: "10k" },
  { valor: 5000, sufijo: "5k" },
  { valor: 2000, sufijo: "2k" },
  { valor: 1000, sufijo: "1000m" },
  { valor: 500, sufijo: "500m" },
  { valor: 200, sufijo: "200m" },
  { valor: 100, sufijo: "100m" }
];

// ===================== UTILIDADES =====================
function colIdx(headers, nombre) {
  var objetivo = String(nombre).trim().toLowerCase();
  for (var i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim().toLowerCase() === objetivo) return i;
  }
  return -1;
}

function aNumero(v) {
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

function fmt(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function escribirLog(msg) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var h = ss.getSheetByName(HOJA_LOG) || ss.insertSheet(HOJA_LOG);
    h.appendRow([new Date(), String(msg)]);
  } catch (e) {}
}

function ceros() {
  var a = [];
  for (var i = 0; i < DENOMS.length; i++) a.push(0);
  return a;
}

// ===================== CALCULO DEL VUELTO =====================
/**
 * Busca como entregar "cambio" con las unidades disponibles (disp[i]).
 * Prefiere billetes grandes, pero si falta una denominacion usa las menores.
 * Devuelve un arreglo con cuantas unidades entregar de cada denominacion,
 * o null si es imposible.
 */
function repartir(cambio, disp) {
  var memo = {};
  function f(i, resto) {
    if (resto === 0) return ceros();
    if (i >= DENOMS.length) return null;
    var clave = i + "|" + resto;
    if (clave in memo) return memo[clave];
    var maximo = Math.min(disp[i], Math.floor(resto / DENOMS[i].valor));
    for (var c = maximo; c >= 0; c--) {
      var sub = f(i + 1, resto - c * DENOMS[i].valor);
      if (sub) {
        var r = sub.slice();
        r[i] = c;
        memo[clave] = r;
        return r;
      }
    }
    memo[clave] = null;
    return null;
  }
  return f(0, cambio);
}

/** Vuelto "ideal" (sin limite de stock), para decirle al cajero que le falta. */
function idealSinLimite(cambio) {
  var resto = cambio;
  var out = [];
  for (var i = 0; i < DENOMS.length; i++) {
    var n = Math.floor(resto / DENOMS[i].valor);
    out.push(n);
    resto -= n * DENOMS[i].valor;
  }
  return out;
}

// ===================== WEBHOOK (lo que llama AppSheet) =====================
function doPost(e) {
  var respuesta;
  try {
    var crudo = (e && e.postData && e.postData.contents) ? e.postData.contents : "";
    escribirLog("doPost recibido: " + (crudo || "SIN DATOS"));
    var datos = JSON.parse(crudo);
    var id = datos.Id_Venta || datos.id_venta;
    if (!id) throw new Error("El cuerpo no trae Id_Venta");
    respuesta = { ok: true, resultado: procesarVenta(id) };
  } catch (err) {
    escribirLog("ERROR doPost: " + err.message);
    respuesta = { ok: false, error: err.message };
  }
  return ContentService.createTextOutput(JSON.stringify(respuesta))
    .setMimeType(ContentService.MimeType.JSON);
}

// Sirve para comprobar desde el navegador que la URL publicada responde.
function doGet(e) {
  escribirLog("doGet recibido: el script publicado responde");
  return ContentService.createTextOutput("OK, el script responde");
}

// ===================== PROCESO PRINCIPAL =====================
function procesarVenta(idVenta) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw new Error("Hay otra venta procesandose, reintente");
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var hoja = ss.getSheetByName(HOJA_VENTAS);
    if (!hoja) throw new Error("No existe la hoja " + HOJA_VENTAS);
    var datos = hoja.getDataRange().getValues();
    var iId = colIdx(datos[0], "Id_Venta");
    if (iId === -1) throw new Error("No existe la columna Id_Venta");
    for (var i = 1; i < datos.length; i++) {
      if (String(datos[i][iId]).trim() === String(idVenta).trim()) {
        // Anti-duplicados: AppSheet a veces llama al webhook varias veces seguidas.
        // Si esta venta ya se proceso con exito hace menos de 2 minutos, se ignora.
        var cache = CacheService.getScriptCache();
        var clave = "ok_" + String(idVenta).trim();
        if (cache.get(clave)) {
          escribirLog("Ignorada: la venta " + idVenta + " ya se proceso hace instantes (duplicado)");
          return "Ignorada: duplicado";
        }
        var res = procesarFila(hoja, i + 1, datos[0]);
        if (String(res).indexOf("OK") === 0) cache.put(clave, "1", 120);
        return res;
      }
    }
    throw new Error("No encontre la venta " + idVenta);
  } finally {
    lock.releaseLock();
  }
}

function procesarFila(hoja, fila, headers) {
  var ss = hoja.getParent();
  var v = hoja.getRange(fila, 1, 1, headers.length).getValues()[0];

  var iEstado = colIdx(headers, "Estado");
  var iObs = colIdx(headers, "Observaciones");
  var iMedio = colIdx(headers, "Medio_de_pago");
  var iEfectivo = colIdx(headers, "Efectivo");
  var iCambio = colIdx(headers, "Cambio");
  if (iEstado === -1 || iObs === -1 || iEfectivo === -1 || iCambio === -1) {
    throw new Error("Faltan columnas en Ventas (Estado, Observaciones, Efectivo o Cambio)");
  }

  // 1. Solo se procesan ventas en estado Pagado
  var estado = String(v[iEstado]).trim().toLowerCase();
  if (estado !== "pagado") {
    escribirLog("Ignorada: Estado = '" + v[iEstado] + "'");
    return "Ignorada: la venta no esta en estado Pagado";
  }

  // 2. Solo efectivo (si el medio de pago viene vacio, se asume efectivo)
  var medio = (iMedio === -1) ? "" : String(v[iMedio]).trim().toLowerCase();
  if (medio !== "" && medio.indexOf("efect") === -1) {
    escribirLog("Ignorada: medio de pago = '" + v[iMedio] + "'");
    return "Ignorada: el pago no es en efectivo";
  }

  // 3. Lo que entrego el cliente
  var recibido = [];
  var pagoPorBilletes = 0;
  var detallePago = [];
  for (var d = 0; d < DENOMS.length; d++) {
    var iC = colIdx(headers, "cant_" + DENOMS[d].sufijo);
    var cant = (iC === -1) ? 0 : aNumero(v[iC]);
    recibido.push(cant);
    pagoPorBilletes += cant * DENOMS[d].valor;
    if (cant > 0) detallePago.push(cant + " de $" + fmt(DENOMS[d].valor));
  }
  var pagoTotal = (pagoPorBilletes > 0) ? pagoPorBilletes : aNumero(v[iEfectivo]);
  if (pagoTotal <= 0) {
    escribirLog("Ignorada: efectivo recibido es 0");
    return "Ignorada: no hay efectivo recibido";
  }
  var cambio = Math.ceil(aNumero(v[iCambio]) / 100) * 100;

  // 4. Stock actual de la caja
  var arq = ss.getSheetByName(HOJA_ARQUEO);
  if (!arq) throw new Error("No existe la hoja " + HOJA_ARQUEO);
  var hArq = arq.getRange(1, 1, 1, arq.getLastColumn()).getValues()[0];
  var vArq = arq.getRange(FILA_ARQUEO, 1, 1, hArq.length).getValues()[0];
  var iArq = [];
  var disp = []; // stock + lo recibido del cliente
  var totalDisp = 0;
  for (d = 0; d < DENOMS.length; d++) {
    iArq[d] = colIdx(hArq, "cant_" + DENOMS[d].sufijo);
    if (iArq[d] === -1) throw new Error("Falta la columna cant_" + DENOMS[d].sufijo + " en " + HOJA_ARQUEO);
    disp.push(aNumero(vArq[iArq[d]]) + recibido[d]);
    totalDisp += disp[d] * DENOMS[d].valor;
  }

  // 5. Calcular el vuelto
  var entrega = repartir(cambio, disp);

  // ---------- NO ALCANZA: alerta y devolver a Pendiente ----------
  if (!entrega) {
    // Mayor monto exacto que SI se puede armar con lo disponible (para explicar cuanto falta)
    var maxExacto = 0;
    for (var m = cambio - 100; m > 0; m -= 100) {
      if (repartir(m, disp)) { maxExacto = m; break; }
    }
    var faltan = [];
    faltan.push("• Con lo disponible solo se puede armar exacto hasta $" + fmt(maxExacto) + " (de $" + fmt(cambio) + ").");
    faltan.push("• Faltan $" + fmt(cambio - maxExacto) + " en billetes/monedas pequenos para completar el cambio exacto.");
    var lineas = [];
    lineas.push("ALERTA: No hay billetes y monedas suficientes en la gaveta para dar el cambio.");
    lineas.push("• El cliente pago con: " + (detallePago.length ? detallePago.join(", ") : "$" + fmt(pagoTotal)));
    lineas.push("• Cambio a devolver: $" + fmt(cambio));
    lineas.push("• Disponible en gaveta (incluye lo recibido): $" + fmt(totalDisp));
    if (faltan.length) {
      lineas.push("");
      lineas.push("Detalle del faltante:");
      lineas.push(faltan.join("\n"));
    }
    lineas.push("");
    lineas.push("Sugerencia: cambie efectivo en Caja Mayor, reabastezca la gaveta y vuelva a pagar.");

    hoja.getRange(fila, iObs + 1).setValue(lineas.join("\n"))
      .setFontWeight("bold").setFontColor("red");
    hoja.getRange(fila, iEstado + 1).setValue("Pendiente");
    SpreadsheetApp.flush();
    escribirLog("ALERTA en " + hoja.getRange(fila, 1, 1, 1).getValue() + " fila " + fila + ": cambio $" + fmt(cambio) + ", disponible $" + fmt(totalDisp));
    return "ALERTA: stock insuficiente, venta devuelta a Pendiente";
  }

  // ---------- SI ALCANZA: escribir vuelto y actualizar arqueo ----------
  hoja.getRange(fila, iObs + 1).setValue("")
    .setFontWeight("normal").setFontColor("black");

  for (d = 0; d < DENOMS.length; d++) {
    var iDev = colIdx(headers, "Dev_" + DENOMS[d].sufijo);
    if (iDev !== -1) hoja.getRange(fila, iDev + 1).setValue(entrega[d]);
    arq.getRange(FILA_ARQUEO, iArq[d] + 1).setValue(disp[d] - entrega[d]);
  }
  SpreadsheetApp.flush();
  escribirLog("OK fila " + fila + ": cambio $" + fmt(cambio) + " entregado, arqueo actualizado");
  return "OK: cambio de $" + fmt(cambio) + " entregado y arqueo actualizado";
}

// ===================== PRUEBAS (ejecutar a mano) =====================
function revisarEstructura() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var problemas = [];
  var v = ss.getSheetByName(HOJA_VENTAS);
  var a = ss.getSheetByName(HOJA_ARQUEO);
  if (!v) problemas.push("Falta la hoja " + HOJA_VENTAS);
  if (!a) problemas.push("Falta la hoja " + HOJA_ARQUEO);
  if (v) {
    var h = v.getRange(1, 1, 1, v.getLastColumn()).getValues()[0];
    var cols = ["Id_Venta", "Estado", "Observaciones", "Medio_de_pago", "Efectivo", "Cambio"];
    for (var d = 0; d < DENOMS.length; d++) {
      cols.push("cant_" + DENOMS[d].sufijo);
      cols.push("Dev_" + DENOMS[d].sufijo);
    }
    for (var i = 0; i < cols.length; i++) {
      if (colIdx(h, cols[i]) === -1) problemas.push("Falta columna en Ventas: " + cols[i]);
    }
  }
  if (a) {
    var ha = a.getRange(1, 1, 1, a.getLastColumn()).getValues()[0];
    for (var j = 0; j < DENOMS.length; j++) {
      if (colIdx(ha, "cant_" + DENOMS[j].sufijo) === -1) problemas.push("Falta columna en Arqueo_caja: cant_" + DENOMS[j].sufijo);
    }
  }
  var texto = problemas.length ? problemas.join(" | ") : "Estructura OK: hojas y columnas correctas";
  Logger.log(texto);
  escribirLog("revisarEstructura: " + texto);
}

function idVentaFila2() {
  var hoja = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(HOJA_VENTAS);
  var headers = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var iId = colIdx(headers, "Id_Venta");
  return hoja.getRange(2, iId + 1).getValue();
}

function pruebaFila2() {
  var r = procesarVenta(idVentaFila2());
  Logger.log(r);
  escribirLog("pruebaFila2: " + r);
}

// Llama a la URL publicada igual que lo hace AppSheet (sin sesion de Google).
function probarWebhook() {
  var url = ScriptApp.getService().getUrl();
  if (!url) {
    Logger.log("No hay una implementacion como aplicacion web");
    escribirLog("probarWebhook: no hay implementacion como aplicacion web");
    return;
  }
  var resp = UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ Id_Venta: idVentaFila2() }),
    muteHttpExceptions: true,
    followRedirects: true
  });
  var texto = "HTTP " + resp.getResponseCode() + " | " + resp.getContentText().substring(0, 300);
  Logger.log(texto);
  escribirLog("probarWebhook -> " + texto);
}
