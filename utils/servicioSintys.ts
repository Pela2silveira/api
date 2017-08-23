import { matching } from '@andes/match';
import * as configPrivate from '../config.private';
import * as config from '../config';
import * as https from 'https';

let to_json = require('xmljson').to_json;

export function getPersonaSintys(nroDocumento: string) {
    let xml = '';
    let pathSintys = configPrivate.sintys.path + 'dni=' + nroDocumento;

    let optionsgetmsg = {
        /*Este servicio debe ser llamado directamente desde los WS
        que están publicados en el servidor 10.1.232.8 ya que por cuestiones
        de seguridad de Sintys, sólo nos dejan consumir datos desde este servidor.
        */
        host: configPrivate.sintys.host,
        port: configPrivate.sintys.port,
        path: pathSintys,
        method: 'GET',
        rejectUnauthorized: false
    };
    // Realizar GET request
    return new Promise((resolve, reject) => {
        let reqGet = https.request(optionsgetmsg, function (res) {
            res.on('data', function (d) {
                if (d.toString()) {
                    xml = xml + d.toString();
                }
            });

            res.on('end', function () {

                if (xml) {
                    // Se parsea el xml obtenido a JSON
                    // console.log('el xml obtenido',xml);
                    to_json(xml, function (error, data) {
                        if (error) {
                            resolve([500, {}]);
                        } else {
                            // console.log('XML parseado a JSON:',data.string._);
                            resolve([res.statusCode, data.string._]);
                        }
                    });
                } else {
                    resolve([res.statusCode, {}]);
                }
            });

        });
        reqGet.end();
        reqGet.on('error', function (e) {
            reject(e);
        });

    });
}

export function formatearDatosSintys(datosSintys) {
    let ciudadano;
    let fecha;
    ciudadano = new Object();
    // console.log('DATOSSINTYS----------->', datosSintys);

    ciudadano.documento = datosSintys.Documento ? datosSintys.Documento.toString() : '';
    // Sintys trae nombre y apellido juntos en 1 solo campo
    ciudadano.apellido = datosSintys.NombreCompleto ? datosSintys.NombreCompleto : '';

    if (datosSintys.Sexo) {
        if (datosSintys.Sexo === 'FEMENINO') {
            ciudadano.sexo = 'femenino';
            ciudadano.genero = 'femenino';
        } else {
            ciudadano.sexo = 'masculino';
            ciudadano.genero = 'masculino';

        }
    }


    if (datosSintys.FechaNacimiento) {
        fecha = datosSintys.FechaNacimiento.split('/');
        let fechaNac = new Date(fecha[2].substr(0, 4), fecha[1] - 1, fecha[0]);
        ciudadano.fechaNacimiento = fechaNac;
    }

    return ciudadano;

}

export function getPacienteSintys(nroDocumento) {
    return new Promise((resolve, reject) => {
        this.getPersonaSintys(nroDocumento)
            .then((resultado) => {
                if (resultado) {
                    let dato = this.formatearDatosSintys(JSON.parse(resultado[1])[0]);
                    resolve(dato);
                }
                resolve(null);
            })
            .catch((err) => {
                reject(err);
            });
    });
}


export function matchSintys(paciente) {
    // Verifica si el paciente tiene un documento valido y realiza la búsqueda a través de Sintys
    let matchPorcentaje = 0;
    let pacienteSintys = {};
    let weights = config.mpi.weightsDefault;
    let match = new matching();

    paciente['matchSintys'] = 0;
    // Se buscan los datos en sintys y se obtiene el paciente
    return new Promise((resolve, reject) => {
        let band = (paciente.entidadesValidadoras) ? (paciente.entidadesValidadoras.indexOf('sintys') < 0) : true;
        if (paciente.documento && band) {
            if (paciente.documento.length >= 7) {
                if (paciente.nombre && paciente.apellido) {
                    paciente.apellido = paciente.apellido + ' ' + paciente.nombre;
                    paciente.nombre = '';
                }
                getPersonaSintys(paciente.documento)
                    .then((resultado) => {
                        if (resultado) {
                            // Verifico el resultado devuelto por el rest de Sintys
                            if (resultado[0] === 200 && JSON.parse(resultado[1])[0]) {
                                console.log('entro por 200');

                                pacienteSintys = formatearDatosSintys(JSON.parse(resultado[1])[0]);
                                matchPorcentaje = match.matchPersonas(paciente, pacienteSintys, weights, 'Levenshtein') * 100;
                                console.log('el % de matcheo es:', matchPorcentaje);
                                paciente['matchSintys'] = matchPorcentaje;
                                resolve({ 'paciente': paciente, 'matcheos': { 'entidad': 'Sintys', 'matcheo': matchPorcentaje, 'datosPaciente': pacienteSintys } });
                            }
                        }
                        resolve({ 'paciente': paciente, 'matcheos': { 'entidad': 'Sintys', 'matcheo': 0, 'datosPaciente': pacienteSintys } });
                    })
                    .catch((err) => {
                        console.error('Error consulta rest Sintys:' + err);
                        reject(err);
                    });

            } else {
                resolve({ 'paciente': paciente, 'matcheos': { 'entidad': 'Sintys', 'matcheo': 0, 'datosPaciente': pacienteSintys } });
            }
        } else {
            resolve({ 'paciente': paciente, 'matcheos': { 'entidad': 'Sintys', 'matcheo': 0, 'datosPaciente': pacienteSintys } });
        }
    });

}




