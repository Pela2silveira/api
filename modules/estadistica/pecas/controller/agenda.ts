import * as mongoose from 'mongoose';
import * as moment from 'moment';
import { Pecas } from '../schemas/pecas';
import * as sql from 'mssql';
import * as configPrivate from '../../../../config.private';
import { Organizacion } from '../../../../core/tm/schemas/organizacion';
import { pecasExport } from '../controller/aggregateQueryPecas';
import { log } from '@andes/log';


let poolTurnos;
const config = {
    user: configPrivate.conSqlPecas.auth.user,
    password: configPrivate.conSqlPecas.auth.password,
    server: configPrivate.conSqlPecas.serverSql.server,
    database: configPrivate.conSqlPecas.serverSql.database,
    connectionTimeout: 10000,
    requestTimeout: 45000
};
let logRequest = {
    user: {
        usuario: { nombre: 'pecasConsolidadoJob', apellido: 'pecasConsolidadoJob' },
        app: 'jobPecas',
        organizacion: 'Subsecretaría de salud'
    },
    ip: 'localhost',
    connection: {
        localAddress: ''
    }
};
/**
 * Actualiza la tabla pecas_consolidado de la BD Andes
 *
 * @export consultaPecas()
 * @returns resultado
 */
export async function consultaPecas(done, start, end) {
    try {
        poolTurnos = await new sql.ConnectionPool(config).connect();
    } catch (ex) {
        return (ex);
    }

    try {
        // Eliminamos los registros temporales de PECAS
        await Pecas.remove({});
        // Exportamos los registros directamente desde mongodb
        await pecasExport(start, end);
        let pecasData: any = await Pecas.find({}).exec();
        let insertsArray = [];
        let cantidadRegistros = pecasData.length;
        // Realizamos le proceso de insertado a pecas SQL
        if (cantidadRegistros > 0) {
            for (let i = 0; i < cantidadRegistros; i++) {
                let doc = pecasData[i];
                await eliminaTurno(doc.idTurno, doc.idAgenda);
                let org = await getEfector(doc.idEfector);
                let idEfectorSips = org.codigo && org.codigo.sips ? org.codigo.sips : null;
                insertsArray.push(auxiliar(doc, idEfectorSips));
            }
            await Promise.all(insertsArray);
            return (done());
        } else {
            return (done(null));
        }
    } catch (error) {
        return (done(error));
    }
}

// castea cada turno asignado y lo inserta en la tabla Sql
async function auxiliar(turno: any, idEfectorSips) {
    try {
        // se verifica si existe el turno en sql
        let queryInsert = 'INSERT INTO ' + configPrivate.conSqlPecas.table.pecasTable +
            '(idEfector, Efector, TipoEfector, DescTipoEfector, IdZona, Zona, SubZona, idEfectorSuperior, EfectorSuperior, AreaPrograma, ' +
            'idAgenda, FechaAgenda, HoraAgenda, estadoAgenda, numeroBloque, turnosProgramados, turnosProfesional, turnosLlaves, turnosDelDia, ' +
            'idTurno, estadoTurno, tipoTurno, sobreturno, FechaConsulta, HoraTurno, Periodo, Tipodeconsulta, estadoTurnoAuditoria, Principal, ConsC2, ConsObst, tipoPrestacion, ' +
            'DNI, Apellido, Nombres, HC, CodSexo, Sexo, FechaNacimiento, Edad, UniEdad, CodRangoEdad, RangoEdad, IdObraSocial, ObraSocial, IdPaciente, telefono, ' +
            'IdBarrio, Barrio, IdLocalidad, Localidad, IdDpto, Departamento, IdPcia, Provincia, IdNacionalidad, Nacionalidad, ' +
            'Calle, Altura, Piso, Depto, Manzana, Longitud, Latitud, ' +
            'Peso, Talla, TAS, TAD, IMC, RCVG, asistencia, reasignado, ' +
            'Diag1CodigoOriginal, Desc1DiagOriginal, Diag1CodigoAuditado, Desc1DiagAuditado, SemanticTag1, SnomedConcept1, SnomedTerm1, primeraVez1, ' +
            'Diag2CodigoOriginal, Desc2DiagOriginal, Diag2CodigoAuditado, Desc2DiagAuditado, SemanticTag2, SnomedConcept2, SnomedTerm2, primeraVez2, ' +
            'Diag3CodigoOriginal, Desc3DiagOriginal, Diag3CodigoAuditado, Desc3DiagAuditado, SemanticTag3, SnomedConcept3, SnomedTerm3, primeraVez3, ' +
            'Profesional, TipoProfesional, CodigoEspecialidad, Especialidad, CodigoServicio, Servicio, ' +
            'codifica, turnosMobile, updated) ' +
            'VALUES  (' + '\'' + idEfectorSips + '\',\'' + turno.Efector + '\',\'' + turno.TipoEfector + '\',\'' + turno.DescTipoEfector +
            '\',' + turno.IdZona + ',\'' + turno.Zona + '\',\'' + turno.SubZona + '\',' + turno.idEfectorSuperior + ',\'' + turno.EfectorSuperior + '\',\'' + turno.AreaPrograma +
            '\',\'' + turno.idAgenda + '\',\'' + moment(turno.FechaAgenda).format('YYYYMMDD') + '\',\'' + turno.HoraAgenda + '\',\'' + turno.estadoAgenda +
            '\',' + turno.numeroBloque + ',' + turno.turnosProgramados + ',' + turno.turnosProfesional + ',' + turno.turnosLlaves + ',' + turno.turnosDelDia +
            ',\'' + turno.idTurno + '\',\'' + turno.estadoTurno + '\',\'' + turno.tipoTurno + '\',\'' + turno.sobreturno + '\',\'' + moment(turno.FechaConsulta).format('YYYYMMDD') + '\',\'' + turno.HoraTurno + '\',' + turno.Periodo + ',\'' + turno.Tipodeconsulta + '\',\'' + turno.estadoTurnoAuditoria + '\',\'' + turno.Principal +
            '\',\'' + turno.ConsC2 + '\',\'' + turno.ConsObst + '\',\'' + turno.tipoPrestacion +
            // DATOS PACIENTE
            '\',' + turno.DNI + ',\'' + turno.Apellido + '\',\'' + turno.Nombres + '\',\'' + turno.HC + '\',\'' + turno.codSexo +
            '\',\'' + turno.Sexo + '\',\'' + moment(turno.FechaNacimiento).format('YYYYMMDD') + '\',' + turno.Edad + ',\'' + turno.uniEdad + '\',\'' + turno.CodRangoEdad +
            '\',\'' + turno.RangoEdad + '\',' + turno.IdObraSocial + ',\'' + turno.ObraSocial + '\',\'' + turno.IdPaciente + '\',\'' + turno.telefono +
            '\',' + turno.IdBarrio + ',\'' + turno.Barrio + '\',' + turno.IdLocalidad +
            ',\'' + turno.Localidad + '\',' + turno.IdDpto + ',\'' + turno.Departamento + '\',' + turno.IdPcia + ',\'' + turno.Provincia +
            '\',' + turno.IdNacionalidad + ',\'' + turno.Nacionalidad + '\',\'' + turno.Calle + '\',\'' + turno.Altura + '\',\'' + turno.Piso +
            '\',\'' + turno.Depto + '\',\'' + turno.Manzana + '\',\'' + turno.Longitud + '\',\'' + turno.Latitud +
            '\',' + turno.Peso + ',' + turno.Talla + ',\'' + turno.TAS + '\',\'' + turno.TAD + '\',\'' + turno.IMC + '\',\'' + turno.RCVG +
            // DATOS CONSULTA
            '\',\'' + turno.asistencia + '\',\'' + turno.reasignado +
            '\',\'' + turno.Diag1CodigoOriginal + '\',\'' + turno.Desc1DiagOriginal + '\',\'' + turno.Diag1CodigoAuditado + '\',\'' + turno.Desc1DiagAuditado +
            '\',\'' + turno.semanticTag1 + '\',\'' + turno.conceptId1 + '\',\'' + turno.term1 + '\',' + turno.primeraVez1 +
            ',\'' + turno.Diag2CodigoOriginal + '\',\'' + turno.Desc2DiagOriginal + '\',\'' + turno.Diag2CodigoAuditado + '\',\'' + turno.Desc2DiagAuditado +
            '\',\'' + turno.semanticTag2 + '\',\'' + turno.conceptId2 + '\',\'' + turno.term2 + '\',' + turno.primeraVez2 +
            ',\'' + turno.Diag3CodigoOriginal + '\',\'' + turno.Desc3DiagOriginal + '\',\'' + turno.Diag3CodigoAuditado + '\',\'' + turno.Desc3DiagAuditado +
            '\',\'' + turno.semanticTag3 + '\',\'' + turno.conceptId3 + '\',\'' + turno.term3 + '\',' + turno.primeraVez3 +
            ',\'' + turno.Profesional + '\',\'' + turno.TipoProfesional + '\',' + turno.CodigoEspecialidad + ',\'' + turno.Especialidad +
            '\',' + turno.CodigoServicio + ',\'' + turno.Servicio + '\',\'' + turno.codifica + '\',' + turno.turnosMobile + ',\'' + moment().format('YYYYMMDD HH:mm') + '\') ';
        return await executeQuery(queryInsert);
    } catch (error) {
        await log(logRequest, 'andes:pecas:bi', null, 'insert', error, null);
        return (error);
    }
}


// async function insertar_agenda(a: any, num_bloque: any) {
//     let ag: any = {};
//     let efector: any = {};
//     try {
//         let org: any = await getEfector(a.organizacion._id);
//         efector = {
//             tipoEfector: org.tipoEstablecimiento && org.tipoEstablecimiento.nombre ? org.tipoEstablecimiento.nombre : null,
//             codigo: org.codigo && org.codigo.sips ? org.codigo.sips : null
//         };
//         let idEfector = efector && efector.codigo ? parseInt(efector.codigo, 10) : null;
//         let tipoEfector = efector && efector.tipoEfector ? efector.tipoEfector : null;
//         ag.idEfector = idEfector;
//         ag.Organizacion = a.organizacion.nombre;
//         ag.idAgenda = a._id;
//         ag.tipoPrestacion = a.tipoPrestaciones && a.tipoPrestaciones.length && a.tipoPrestaciones[0] ? a.tipoPrestaciones[0].term : null;
//         ag.FechaAgenda = moment(a.horaInicio).format('YYYYMMDD');
//         ag.HoraAgenda = moment(a.horaInicio).format('HH:mm').toString();
//         ag.estadoAgenda = a.estado;
//         ag.numeroBloque = num_bloque;
//         ag.idTurno = a.bloques && a.bloques.length ? a.bloques[0]._id : null;


//         if (tipoEfector && tipoEfector === 'Centro de Salud') {
//             ag.TipoEfector = '1';
//         }
//         if (tipoEfector && tipoEfector === 'Hospital') {
//             ag.TipoEfector = '2';
//         }
//         if (tipoEfector && tipoEfector === 'Puesto Sanitario') {
//             ag.TipoEfector = '3';
//         }
//         if (tipoEfector && tipoEfector === 'ONG') {
//             ag.TipoEfector = '6';
//         }
//         ag.DescTipoEfector = tipoEfector;

//         let queryInsert = 'INSERT INTO ' + configPrivate.conSqlPecas.table.pecasTable +
//             '(idEfector, Efector, TipoEfector, DescTipoEfector, idAgenda, FechaAgenda, HoraAgenda, estadoAgenda, numeroBloque,  idTurno, tipoPrestacion,  updated) ' +
//             'VALUES  ( ' + ag.idEfector + ',\'' + ag.Organizacion + '\',\'' + ag.TipoEfector + '\',\'' + ag.DescTipoEfector +
//             '\',\'' + ag.idAgenda + '\',\'' + ag.FechaAgenda + '\',\'' + ag.HoraAgenda + '\',\'' + ag.estadoAgenda +
//             '\',' + ag.numeroBloque + ',\'' + ag.idTurno + '\',\'' + ag.tipoPrestacion + '\',\'' + moment().format('YYYYMMDD HH:mm') + '\') ';
//         await executeQuery(queryInsert);

//     } catch (error) {
//         return (error);
//     }
// }

/**
 * @param request sql request object
 * @param {string} columnName sql table column name
 * @param {string} paramNamePrefix prefix for parameter name
 * @param type parameter type
 * @param {Array<string>} values an array of values
 */
// function parameteriseQueryForIn(request, columnName, parameterNamePrefix, type, values) {
//     let parameterNames = [];
//     for (let i = 0; i < values.length; i++) {
//         let parameterName = parameterNamePrefix + i;
//         request.input(parameterName, type, values[i]);
//         parameterNames.push(`@${parameterName}`);
//     }
//     return `${columnName} IN (${parameterNames.join(',')})`;
// }

// async function eliminaTurnoPecas(turnos: any[]) {
async function eliminaAgenda(id_agenda: string) {
    const result = new sql.Request(poolTurnos);
    // let query = `DELETE FROM ${configPrivate.conSqlPecas.table.pecasTable} WHERE ` + parameteriseQueryForIn(result, 'idTurno', 'idTurno', sql.NVarChar, turnos);
    let query = `DELETE FROM ${configPrivate.conSqlPecas.table.pecasTable} WHERE idAgenda='${id_agenda}'`;
    return await result.query(query);
}

async function eliminaTurno(id_turno: string, id_agenda: string) {
    const result = new sql.Request(poolTurnos);
    // let query = `DELETE FROM ${configPrivate.conSqlPecas.table.pecasTable} WHERE ` + parameteriseQueryForIn(result, 'idTurno', 'idTurno', sql.NVarChar, turnos);
    let query = `DELETE FROM ${configPrivate.conSqlPecas.table.pecasTable} WHERE idAgenda='${id_agenda}' and idTurno='${id_turno}'`;
    return await result.query(query);
}

const orgCache = {};
async function getEfector(idOrganizacion: any) {
    if (orgCache[idOrganizacion]) {
        return orgCache[idOrganizacion];
    } else {
        const org: any = await Organizacion.findById(idOrganizacion);
        if (org) {
            orgCache[idOrganizacion] = org;
            return org;
        }
        return null;
    }
}
function calcularEdad(fechaNacimiento) {
    let edad: any;
    const fechaActual: Date = new Date();
    const fechaAct = moment(fechaActual, 'YYYY-MM-DD HH:mm:ss');
    const difDias = fechaAct.diff(fechaNacimiento, 'd'); // Diferencia en días
    const difAnios = Math.floor(difDias / 365.25);
    const difMeses = Math.floor(difDias / 30.4375);

    if (difAnios !== 0) {
        edad = {
            valor: difAnios,
            unidad: 'A'
        };
        if (difAnios <= 4) {
            edad['CodRangoEdad'] = '2';
            edad['RangoEdad'] = '[1 a 4]';
        } else if (difAnios >= 5 && difAnios <= 14) {
            edad['CodRangoEdad'] = '3';
            edad['RangoEdad'] = '[5 a 14]';
        } else if (difAnios >= 15 && difAnios <= 19) {
            edad['CodRangoEdad'] = '4';
            edad['RangoEdad'] = '[15 a 19]';
        } else if (difAnios >= 20 && difAnios <= 39) {
            edad['CodRangoEdad'] = '5';
            edad['RangoEdad'] = '[20 a 39]';
        } else if (difAnios >= 40 && difAnios <= 69) {
            edad['CodRangoEdad'] = '6';
            edad['RangoEdad'] = '[40 a 69]';
        } else if (difAnios >= 70) {
            edad['CodRangoEdad'] = '7';
            edad['RangoEdad'] = '[70 y +]';
        }
    } else if (difMeses !== 0) {
        edad = {
            valor: difMeses,
            unidad: 'M',
            CodRangoEdad: '1',
            RangoEdad: '[1]'
        };
    } else if (difDias !== 0) {
        edad = {
            valor: difDias,
            unidad: 'D',
            CodRangoEdad: '1',
            RangoEdad: '[1]'
        };
    }
    return edad;
}
function organizacionesExcluidas() {
    let organizaciones = [];
    const medicoIntegral = '5a5e3f7e0bd5677324737244';
    organizaciones.push({ 'organizacion._id': { $ne: mongoose.Types.ObjectId(medicoIntegral) } });
    return organizaciones;
}
async function executeQuery(query: any) {
    try {
        query += ' select SCOPE_IDENTITY() as id';
        const result = await new sql.Request(poolTurnos).query(query);
        if (result && result.recordset) {
            return result.recordset[0].id;
        }
    } catch (err) {

        // Ojo falta reemplazar los las KEY del archivo final de configuraciones para logs.
        await log(logRequest, 'andes:pecas:bi', null, 'SQLOperation', err, null);
        return err;
    }
}

