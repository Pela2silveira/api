import * as config from '../../../config';
import * as configPrivate from '../../../config.private';
import * as moment from 'moment';
import * as mongoose from 'mongoose';
import * as camasController from './../controllers/cama';
import * as internacionesController from './../controllers/internacion';
import * as censoController from './../controllers/censo';

export function censoDiario(unidad,fecha){

    return new Promise( function(resolve,reject){
        let listadoCensos = [];
    camasController.camaOcupadasxUO(unidad, fecha).then(
        camas => {
            if (camas) {
                let salidaCamas = Promise.all(camas.map(c => camasController.desocupadaEnDia(c, fecha)))
                salidaCamas.then(salida => {
                    salida = salida.filter(s => s);
                    let pasesDeCama = Promise.all(salida.map(c => internacionesController.PasesParaCenso(c)));
                    pasesDeCama.then(resultado => {
                        let pasesCamaCenso: any[] = resultado;
                        // loopeamos todos los pases de las camas
                       pasesCamaCenso.map((censo: any, indice) => {
                            censo.pases = censo.pases.filter(p => { return p.estados.fecha <= moment(fecha).endOf('day').toDate(); });
                            // Llamamos a la funcion completarUnCenso que se encarga de devolvernos un array
                            // con la informacion que necesitamos para el censo. (ingreso, pase de, pase a, etc)
                            let result = completarUnCenso(censo, indice, fecha, unidad, pasesCamaCenso[indice]);

                            let index = -2;
                            if (result['esIngreso'] && result['esPaseDe']) {
                                index = censo.pases.findIndex(p => p.estados._id === result['esPaseDe']._id);
                            }

                            if (!result['esIngreso'] && result['esPaseA'] && result['esPaseDe']) {
                                if (result['esPaseA'].fecha <= result['esPaseDe'].fecha) {
                                    index = censo.pases.findIndex(p => p.estados._id === result['esPaseA']._id);
                                }
                            }

                            if (index >= 0) {
                                let pases1 = censo.pases.slice(0, (index + 1));
                                let pases2 = censo.pases.slice(index, censo.pases.length);

                                censo.pases = pases1;
                                let nuevoCenso = Object.assign({}, censo);
                                nuevoCenso.pases = pases2;
                                let algo = completarUnCenso(censo, indice, fecha, unidad, pasesCamaCenso[indice]);
                                listadoCensos.push(algo);
                                let algo2 = completarUnCenso(nuevoCenso, indice, fecha, unidad, pasesCamaCenso[indice]);
                                listadoCensos.push(algo2);

                            } else {

                                listadoCensos.push(result);
                              
                            }

                        });
                        console.log("listado",listadoCensos)
                        return resolve(listadoCensos);
                    }).catch(error => {
                        return reject(error);
                    });
                });
            } else {
                return null;
            }
        }).catch(err => {
            return reject(err);
        });

    })
}

export function completarResumenDiario(listadoCenso, unidad, fecha ){
    let resumenCenso = {
        existencia0: 0,
        ingresos: 0,
        pasesDe: 0,
        egresosAlta: 0,
        egresosDefuncion: 0,
        pasesA: 0,
        existencia24: 0,
        ingresoEgresoDia: 0,
        pacientesDia: 0,
        disponibles24: 0,
        disponibles0: 0
    };
    if (listadoCenso) {
        Object.keys(listadoCenso).forEach(indice => {
            resumenCenso.disponibles24 += 1;
            resumenCenso.existencia24 += 1;
            if (listadoCenso[indice]['esIngreso']) {
                resumenCenso.ingresos += 1;
            }
            if (listadoCenso[indice]['esIngreso'] && listadoCenso[indice]['esPaseDe']) {
                resumenCenso.existencia0 += 1;
            }

            if (listadoCenso[indice]['esPaseDe']) {
                resumenCenso.pasesDe += 1;
            }

            if (listadoCenso[indice]['esPaseA']) {
                resumenCenso.pasesA += 1;
            }

            if (listadoCenso[indice]['egreso'] !== '') {
                if (listadoCenso[indice]['egreso'] === 'Defunción') {
                    resumenCenso.egresosDefuncion += 1;
                } else {
                    resumenCenso.egresosAlta += 1;
                }
                if (listadoCenso[indice]['esIngreso']) {
                    resumenCenso.ingresoEgresoDia += 1;
                }
            }
        });
        resumenCenso.pacientesDia = resumenCenso.existencia0 +
            resumenCenso.ingresos + resumenCenso.pasesDe -
            resumenCenso.egresosDefuncion - resumenCenso.egresosAlta;

        resumenCenso.existencia24 = resumenCenso.existencia24 -
            resumenCenso.egresosDefuncion - resumenCenso.egresosAlta - resumenCenso.pasesA;

    }


    camasController.disponibilidadXUO(unidad,fecha).then((respuesta: any) => {
        if (respuesta) {
            resumenCenso.disponibles0 = respuesta.disponibilidad0 ? respuesta.disponibilidad0 : 0;
            resumenCenso.disponibles24 = respuesta.disponibilidad24 ? respuesta.disponibilidad24 : 0;
        }

   
    });
    return resumenCenso;
}

export async function censoMensual(fechaDesde, fechaHasta, unidad) {
    return new Promise(function (resolve, reject) {
        let resultadoFinal;
        let censoMensual = [];
        fechaDesde = moment(fechaDesde).startOf('day');
        fechaHasta = moment(fechaHasta).endOf('day');
        let fecha = new Date(fechaDesde);
        let promises = [];

        while (fechaDesde < fechaHasta) {


            promises.push(censoDiario(unidad, fechaDesde.toDate()));
            fechaDesde.add(1, 'days');

        }
        Promise.all(promises).then(censosDiarios => {
            censosDiarios.forEach(unCenso => {
                console.log(unCenso)
                let resumen = censoController.completarResumenDiario(unCenso, unidad, fechaDesde.toDate())
                resultadoFinal = {

                    censoDiario: fechaDesde.toDate(),
                    resumen: resumen
                }
                console.log("atroden", resultadoFinal)
                censoMensual.push(resumen);
            })
            return resolve(censoMensual)
        });
      
    });
}




export function completarUnCenso(censo, indice, fecha, idUnidadOrganizativa, CamaCenso) {
    let internacion = CamaCenso.internacion;
    let ingresoEgreso = [];
    ingresoEgreso[indice] = {};
    ingresoEgreso[indice]['dataCenso'] = CamaCenso;
    ingresoEgreso[indice]['egreso'] = comprobarEgreso(internacion, censo.pases, fecha, idUnidadOrganizativa);
    ingresoEgreso[indice]['esIngreso'] = esIngreso(censo.pases, fecha, idUnidadOrganizativa);
    ingresoEgreso[indice]['esPaseDe'] = esPaseDe(censo.pases, fecha, idUnidadOrganizativa);
    ingresoEgreso[indice]['esPaseA'] = esPaseA(censo.pases, fecha, idUnidadOrganizativa);
    return ingresoEgreso[indice];
}

function esIngreso(pases, fecha, idUnidadOrganizativa) {
    if (pases && pases.length >= 1) {
        let fechaInicio = moment(fecha).startOf('day').toDate();
        let fechaFin = moment(fecha).endOf('day').toDate();
        if (pases[0].estados.fecha >= fechaInicio && pases[0].estados.fecha <= fechaFin) {
            if (pases[0].estados.unidadOrganizativa.conceptId === idUnidadOrganizativa) {

                return true;
            } else { return false; }
        } else { return false; }
    } else { return false; }
}

function esPaseDe(pases, fecha, idUnidadOrganizativa) {
    if (pases && pases.length > 1) {
        let fechaInicio = moment(fecha).startOf('day').toDate();
        let fechaFin = moment(fecha).endOf('day').toDate();

        // buscamos el ultimo pase de la UO que estamos filtrando
        let ultimoIndice = -1;
        pases.forEach((p, i) => {
            if (p.estados.unidadOrganizativa.conceptId === idUnidadOrganizativa) {
                ultimoIndice = i;
            }
        });
        let ultimoPase = pases[ultimoIndice];
        let paseAnterior = pases[ultimoIndice - 1];
        if (ultimoPase.estados.fecha >= fechaInicio && ultimoPase.estados.fecha <= fechaFin) {
            if (paseAnterior && paseAnterior.estados.unidadOrganizativa.conceptId !== idUnidadOrganizativa) {
                return paseAnterior.estados;
            }
        }
    }
    return null;
}

function esPaseA(pases, fecha, idUnidadOrganizativa) {
    if (pases && pases.length > 1) {
        let fechaInicio = moment(fecha).startOf('day').toDate();
        let fechaFin = moment(fecha).endOf('day').toDate();
        let ultimoPase = pases[pases.length - 1];
        let paseAnterior = pases[pases.length - 2];

        if (ultimoPase.estados.fecha >= fechaInicio && ultimoPase.estados.fecha <= fechaFin) {
            if (paseAnterior.estados.unidadOrganizativa.conceptId === idUnidadOrganizativa &&
                ultimoPase.estados.unidadOrganizativa.conceptId !== idUnidadOrganizativa) {
                return ultimoPase.estados;
            } else {
                let paseAux = pases[pases.length - 3];
                if (paseAux && ultimoPase.estados.unidadOrganizativa.conceptId === idUnidadOrganizativa && paseAux.estados.unidadOrganizativa.conceptId === idUnidadOrganizativa) {
                    return paseAnterior.estados;
                }
            }
        }
    }
    return null;
}

function comprobarEgreso(internacion, pases, fecha, idUnidadOrganizativa) {
    let fechaInicio = moment(fecha).startOf('day').toDate();
    let fechaFin = moment(fecha).endOf('day').toDate();
    let registros = internacion.ejecucion.registros;
    let egresoExiste = registros.find(registro => registro.concepto.conceptId === '58000006');

    if (egresoExiste) {
        if (egresoExiste.valor.InformeEgreso.fechaEgreso && egresoExiste.valor.InformeEgreso.tipoEgreso) {
            if (pases[pases.length - 1].estados.unidadOrganizativa.conceptId === idUnidadOrganizativa) {
                return egresoExiste.valor.InformeEgreso.tipoEgreso.nombre;
            }
        }

    }
    return '';
}
