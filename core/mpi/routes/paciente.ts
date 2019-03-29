import * as express from 'express';
import * as mongoose from 'mongoose';
import { Matching } from '@andes/match';
import { pacienteMpi, paciente } from '../schemas/paciente';
import { log } from '../../log/schemas/log';
import * as controller from '../controller/paciente';
import { Auth } from './../../../auth/auth.class';
import { Logger } from '../../../utils/logService';
import { ElasticSync } from '../../../utils/elasticSync';
import * as debug from 'debug';
import { toArray } from '../../../utils/utils';
import { EventCore } from '@andes/event-bus';
import { log as andesLog } from '@andes/log';
import { logKeys } from '../../../config';

const logD = debug('paciente-controller');
const router = express.Router();

/* Consultas de estado de pacientes para el panel de información */
router.get('/pacientes/counts/', (req, res, next) => {
    /* Este get es público ya que muestra sólamente la cantidad de pacientes en MPI */
    let filtro;
    switch (req.query.consulta) {
        case 'validados':
            filtro = {
                estado: 'validado'
            };
            break;
        case 'temporales':
            filtro = {
                estado: 'temporal'
            };
            break;
        case 'fallecidos':
            filtro = {
                fechaFallecimiento: {
                    $exists: true
                }
            };
            break;
    }
    const query = paciente.find(filtro).count();
    query.exec((err, data) => {
        if (err) {
            return next(err);
        }

        const queryMPI = pacienteMpi.find(filtro).count();
        queryMPI.exec((err1, data1) => {
            if (err1) {
                return next(err1);
            }
            const total = data + data1;
            res.json(total);
        });

    });
});

router.get('/pacientes/dashboard/', async (req, res, next) => {
    /**
     * Se requiere autorización para acceder al dashboard de MPI
     */
    if (!Auth.check(req, 'mpi:paciente:dashboard')) {
        return next(403);
    }
    const result = {
        paciente: [],
        pacienteMpi: [],
        logs: []
    };

    const estadoAggregate = [{
        $group: {
            _id: {
                estado: '$estado'
            },
            count: {
                $sum: 1
            }
        }
    }];

    const logAggregate = [
        {
            $group: {
                _id: {
                    operacion: '$operacion',
                    modulo: '$modulo'
                },
                count: {
                    $sum: 1
                }
            }
        },
        {
            $match: {
                '_id.modulo': 'mpi'
            }
        }
    ];

    result.paciente = await toArray(paciente.aggregate(estadoAggregate).cursor({}).exec());
    result.pacienteMpi = await toArray(pacienteMpi.aggregate(estadoAggregate).cursor({ batchSize: 1000 }).exec());
    result.logs = await toArray(log.aggregate(logAggregate).cursor({ batchSize: 1000 }).exec());
    res.json(result);
});

router.post('/pacientes/validar/', async (req, res, next) => {
    // TODO modificar permiso renaper -> validar/validacion o algo asi
    if (!Auth.check(req, 'fa:get:renaper')) {
        return next(403);
    }
    const pacienteAndes = req.body;
    if (pacienteAndes && pacienteAndes.documento && pacienteAndes.sexo) {
        try {
            // chequeamos si el par dni-sexo ya existe en ANDES
            const resultadoCheck = await controller.checkRepetido(pacienteAndes);
            let resultado;
            if (resultadoCheck.dniRepetido) {
                resultado = { paciente: resultadoCheck.resultadoMatching[0].paciente, existente: true };
            } else {
                resultado = await controller.validarPaciente(pacienteAndes, req);
                resultado.existente = false;
            }
            res.json(resultado);
            andesLog(req, logKeys.validacionPaciente.key, null, logKeys.validacionPaciente.operacion, resultado);
        } catch (err) {
            andesLog(req, logKeys.errorValidacionPaciente.key, null, logKeys.errorValidacionPaciente.operacion, err);
            return next(err);
        }
    } else {
        return next(500);
    }
});

router.get('/pacientes/auditoria/', (req, res, next) => {
    let filtro;
    switch (req.query.estado) {
        case 'validados':
            filtro = {
                estado: 'validado'
            };
            break;
        case 'temporales':
            filtro = {
                estado: 'temporal'
            };
            break;
        case 'fallecidos':
            filtro = {
                fechaFallecimiento: {
                    $exists: true
                }
            };
            break;
    }
    filtro['activo'] = req.query.activo === 'true' ? true : false;

    let query = paciente.find(filtro);
    query.exec((err, data) => {
        if (err) {
            return next(err);
        }
        res.json(data);
    });

});

router.put('/pacientes/auditoria/setActivo', async (req, res, next) => {
    // if (!Auth.check(req, 'mpi:paciente:putAndes')) {
    //     return next(403);
    // }
    if (!(mongoose.Types.ObjectId.isValid(req.body.id))) {
        return next(404);
    }
    const objectId = new mongoose.Types.ObjectId(req.body.id);
    const query = {
        _id: objectId
    };

    try {
        andesLog(req, logKeys.mpiAuditoriaSetActivo.key, req.body._id, logKeys.mpiAuditoriaSetActivo.operacion, req.body, null);

        let patientFound: any = await paciente.findById(query).exec();

        if (patientFound) {
            const data = req.body;
            if (patientFound.estado === 'validado' && !patientFound.isScan) {
                delete data.documento;
                delete data.estado;
                delete data.sexo;
                delete data.fechaNacimiento;
            }
            let pacienteUpdated = await controller.updatePaciente(patientFound, data, req);
            res.json(pacienteUpdated);
        } else {
            req.body._id = req.body.id;
            let newPatient = new paciente(req.body);

            // verifico si el paciente ya está en MPI
            let patientFountMpi: any = await pacienteMpi.findById(query).exec();

            if (patientFountMpi) {
                Auth.audit(newPatient, req);
            }
            await newPatient.save();
            const nuevoPac = JSON.parse(JSON.stringify(newPatient));
            const connElastic = new ElasticSync();
            let updated = await connElastic.sync(newPatient);
            if (updated) {
                Logger.log(req, 'mpi', 'update', {
                    original: nuevoPac,
                    nuevo: newPatient
                });
            } else {
                Logger.log(req, 'mpi', 'insert', newPatient);
            }
            EventCore.emitAsync('mpi:patient:update', nuevoPac);
            res.json(nuevoPac);
        }
    } catch (error) {
        return next(error);
    }
});

router.get('/pacientes/auditoria/vinculados/', async (req, res, next) => {
    let filtro = {
        'identificadores.0': { $exists: true },
        'identificadores.entidad': 'ANDES'
    };
    // filtro['activo'] = req.query.activo === 'true' ? true : false;
    try {
        let resultadosAndes = paciente.find(filtro).exec();
        let resultadosMpi = pacienteMpi.find(filtro).exec();
        const pacientes = await Promise.all([resultadosAndes, resultadosMpi]);
        let listado = [...pacientes[0], ...pacientes[1]];
        res.json(listado);
    } catch (error) {
        return next(error);
    }

});
router.get('/pacientes/inactivos/', async (req, res, next) => {
    let filtro = {
        activo: false
    };
    // filtro['activo'] = req.query.activo === 'true' ? true : false;
    try {
        let resultadosAndes = paciente.find(filtro).exec();
        let resultadosMpi = pacienteMpi.find(filtro).exec();
        const pacientes = await Promise.all([resultadosAndes, resultadosMpi]);
        let listado = [...pacientes[0], ...pacientes[1]];
        res.json(listado);
    } catch (error) {
        return next(error);
    }

});


// Simple mongodb query by ObjectId --> better performance
router.get('/pacientes/:id', (req, res, next) => {
    // busca en pacienteAndes y en pacienteMpi
    if (!Auth.check(req, 'mpi:paciente:getbyId')) {
        return next(403);
    }
    if (!(mongoose.Types.ObjectId.isValid(req.params.id))) {
        return next(404);
    }
    controller.buscarPaciente(req.params.id).then((resultado: any) => {
        if (resultado) {
            EventCore.emitAsync('mpi:paciente:get', resultado.paciente);
            res.json(resultado.paciente);
        } else {
            return next(500);
        }
    }).catch((err) => {
        return next(err);
    });

});


/**
 * @swagger
 * /pacientes:
 *   get:
 *     tags:
 *       - Paciente
 *     description: Retorna un arreglo de objetos Paciente
 *     summary: Buscar pacientes usando ElasticSearch
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: type
 *         description: tipo de búsqueda
 *         in: body
 *         required: true
 *         type: string
 *         enum:
 *              - simplequery
 *              - multimatch
 *              - suggest
 *       - name: cadenaInput
 *         description: pámetro requerido para multimatch
 *         in: body
 *         type: string
 *       - name: claveBlocking
 *         description: pámetro requerido para suggest
 *         in: body
 *         type: string
 *       - name: percentage
 *         description: pámetro requerido para suggest
 *         in: body
 *         type: boolean
 *       - name: documento
 *         description: pámetro requerido para suggest y simplequery
 *         in: body
 *         type: string
 *       - name: nombre
 *         description: pámetro requerido para suggest y simplequery
 *         in: body
 *         type: string
 *       - name: apellido
 *         description: pámetro requerido para suggest y simplequery
 *         in: body
 *         type: string
 *       - name: sexo
 *         description: pámetro requerido para suggest y simplequery
 *         in: body
 *         type: string
 *       - name: fechaNacimiento
 *         description: pámetro requerido para suggest
 *         in: body
 *         type: Date
 *       - name: escaneado
 *         description: pámetro requerido para suggest
 *         in: body
 *         type: boolean
 *     responses:
 *       200:
 *         description: un arreglo de objetos paciente
 *       400:
 *         description: Error- Agregar parámetro de búsqueda
 *
 */
// Search using elastic search
router.get('/pacientes', (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:elasticSearch')) {
        return next(403);
    }

    controller.matching(req.query).then(result => {
        res.send(result);
    }).catch(error => {
        return next(error);
    });
});


router.put('/pacientes/mpi/:id', (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:putMpi')) {
        return next(403);
    }
    if (!(mongoose.Types.ObjectId.isValid(req.params.id))) {
        return next(404);
    }
    const ObjectId = mongoose.Types.ObjectId;
    const objectId = new ObjectId(req.params.id);
    const query = {
        _id: objectId
    };

    const match = new Matching();

    pacienteMpi.findById(query, async (err, patientFound: any) => {
        if (err) {
            return next(404);
        }

        const connElastic = new ElasticSync();
        if (patientFound) {
            const data = req.body;
            controller.updatePacienteMpi(patientFound, data, req).then(async (p: any) => {
                res.json(p);
            }).catch(next);
        } else {
            const newPatient: any = new pacienteMpi(req.body);
            const claves = match.crearClavesBlocking(newPatient);
            newPatient['claveBlocking'] = claves;
            newPatient['apellido'] = newPatient['apellido'].toUpperCase();
            newPatient['nombre'] = newPatient['nombre'].toUpperCase();

            Auth.audit(newPatient, req);
            newPatient.save((err2) => {
                if (err2) {
                    return next(err2);
                }
                const nuevoPac = JSON.parse(JSON.stringify(newPatient));
                delete nuevoPac._id;

                connElastic.create(newPatient._id.toString(), nuevoPac).then(() => {
                    EventCore.emitAsync('mpi:patient:update', newPatient);
                    Logger.log(req, 'mpi', 'elasticInsertInPut', newPatient);
                    res.json();
                }).catch(error => {
                    return next(error);
                });
            });
        }
    });
});

/**
 * @swagger
 * /pacientes/mpi/{id}:
 *   delete:
 *     tags:
 *       - Paciente
 *     description: Eliminar un paciente del core de MPI
 *     summary: Eliminar un paciente del core de MPI
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         description: Id de un paciente
 *         required: true
 *         type: string
 *
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 */
router.delete('/pacientes/mpi/:id', (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:deleteMpi')) {
        return next(403);
    }

    const query = {
        _id: new mongoose.Types.ObjectId(req.params.id)
    };

    pacienteMpi.findById(query, (err, patientFound) => {
        if (err) {
            return next(err);
        }
        patientFound.remove();

        const connElastic = new ElasticSync();
        connElastic.delete(patientFound._id.toString()).then(() => {
            res.json(patientFound);
            EventCore.emitAsync('mpi:patient:delete', patientFound);
        }).catch(error => {
            return next(error);
        });
        Auth.audit(patientFound, req);
    }).catch((error) => {
        return next(error);
    });
});

/**
 * @swagger
 * /pacientes:
 *   post:
 *     tags:
 *       - Paciente
 *     description: Cargar un paciente
 *     summary: Cargar un paciente
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: organizacion
 *         description: objeto paciente
 *         in: body
 *         required: true
 *         schema:
 *           $ref: '#/definitions/paciente'
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 *       409:
 *         description: Un código de error con un array de mensajes de error
 */
router.post('/pacientes', async (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:postAndes')) {
        return next(403);
    }
    try {
        if (req.body.documento) {
            // Todo loguear posible duplicado si ignora el check
            let resultado = await controller.checkRepetido(req.body);
            if ((resultado && resultado.resultadoMatching.length <= 0) || (resultado && resultado.resultadoMatching.length > 0 && req.body.ignoreCheck && !resultado.macheoAlto && !resultado.dniRepetido)) {
                req.body.activo = true;
                let pacienteObj = await controller.createPaciente(req.body, req);
                // se carga geo referencia desde api de google
                res.json(pacienteObj);
                if (req.body.estado === 'validado') {
                    await controller.actualizarGeoReferencia(pacienteObj, req);
                }
            } else {
                return res.json(resultado);
            }
        } else {
            req.body.activo = true;
            let pacienteObjSinDocumento = await controller.createPaciente(req.body, req);
            return res.json(pacienteObjSinDocumento);
        }
    } catch (error) {
        logD(error);
        return next(error);
    }
});

/**
 * @swagger
 * /pacientes:
 *   put:
 *     tags:
 *       - Paciente
 *     description: Actualizar un paciente
 *     summary: Actualizar un paciente
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         description: _Id del paciente
 *         required: true
 *         type: string
 *       - name: paciente
 *         description: objeto paciente
 *         in: body
 *         required: true
 *         schema:
 *           $ref: '#/definitions/paciente'
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 */

router.put('/pacientes/:id', async (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:putAndes')) {
        return next(403);
    }
    if (!(mongoose.Types.ObjectId.isValid(req.params.id))) {
        return next(404);
    }
    const objectId = new mongoose.Types.ObjectId(req.params.id);
    const query = {
        _id: objectId
    };
    try {
        // Todo loguear posible duplicado si ignora el check
        let resultado = await controller.checkRepetido(req.body);

        if ((resultado && resultado.resultadoMatching.length <= 0) || (resultado && resultado.resultadoMatching.length > 0 && req.body.ignoreCheck && !resultado.macheoAlto && !resultado.dniRepetido)) {
            let patientFound: any = await paciente.findById(query).exec();

            if (patientFound) {
                const direccionOld = patientFound.direccion[0].valor;
                const data = req.body;
                if (patientFound.estado === 'validado' && !patientFound.isScan) {
                    delete data.documento;
                    delete data.estado;
                    delete data.sexo;
                    delete data.fechaNacimiento;
                }
                let pacienteUpdated = await controller.updatePaciente(patientFound, data, req);
                // try {
                //     controller.updateTurnosPaciente(pacienteUpdated);
                // } catch (error) {
                //     return next('Error actualizando turnos del paciente');
                // }
                res.json(pacienteUpdated);
                // si el paciente esta validado y hay cambios en direccion o localidad..
                if (patientFound.estado === 'validado' && (direccionOld !== data.direccion[0].valor)) {
                    await controller.actualizarGeoReferencia(pacienteUpdated, req);
                }
            } else {
                req.body._id = req.body.id;
                let newPatient = new paciente(req.body);

                // verifico si el paciente ya está en MPI
                let patientFountMpi: any = await pacienteMpi.findById(query).exec();
                const direccionOld = patientFountMpi.direccion[0].valor;

                if (patientFountMpi) {
                    Auth.audit(newPatient, req);
                }
                await newPatient.save();
                const nuevoPac = JSON.parse(JSON.stringify(newPatient));
                const connElastic = new ElasticSync();
                let updated = await connElastic.sync(newPatient);
                if (updated) {
                    Logger.log(req, 'mpi', 'update', {
                        original: nuevoPac,
                        nuevo: newPatient
                    });
                } else {
                    Logger.log(req, 'mpi', 'insert', newPatient);
                }
                EventCore.emitAsync('mpi:patient:update', nuevoPac);
                res.json(nuevoPac);
                // se carga geo referencia desde api de google
                if (direccionOld !== req.body.direccion[0].valor) {
                    await controller.actualizarGeoReferencia(newPatient, req);
                }
            }
        } else {
            return res.json(resultado);
        }
    } catch (error) {
        return next(error);
    }
});
/**
 * @swagger
 * /pacientes/{id}:
 *   delete:
 *     tags:
 *       - Paciente
 *     description: Eliminar un paciente
 *     summary: Eliminar un paciente
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         description: Id de un paciente
 *         required: true
 *         type: string
 *
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 */
router.delete('/pacientes/:id', (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:deleteAndes')) {
        return next(403);
    }
    const ObjectId = mongoose.Types.ObjectId;
    const objectId = new ObjectId(req.params.id);
    controller.deletePacienteAndes(objectId).then((patientFound: any) => {
        let connElastic = new ElasticSync();
        connElastic.delete(patientFound._id.toString()).then(() => {
            res.json(patientFound);
        }).catch(error => {
            return next(error);
        });
        Auth.audit(patientFound, req);
    }).catch((error) => {
        return next(error);
    });
});


/**
 * @swagger
 * /pacientes/{id}/identificadores:
 *   post:
 *     tags:
 *       - Paciente
 *       - Activo
 *     description: Modificar el array de identificadores del paciente
 *     summary: Modificar el array de identificadores del paciente
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         description: Id de un paciente
 *         required: true
 *         type: string
 *
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 */
router.post('/pacientes/:id/identificadores', async (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:patchAndes')) {
        return next(403);
    }
    try {
        let pacienteBase = await controller.buscarPaciente(req.params.id);
        let pacienteLinkeado: any = await controller.buscarPaciente(req.body.dto.valor);
        if (pacienteBase && pacienteLinkeado) {
            if (req.body.op === 'link') {
                controller.linkIdentificadores(req, pacienteBase.paciente);
                pacienteLinkeado.paciente.markModified('activo');
                pacienteLinkeado.paciente.activo = false;
            }
            if (req.body.op === 'unlink') {
                controller.unlinkIdentificadores(req, pacienteBase.paciente);
                pacienteLinkeado.paciente.markModified('activo');
                pacienteLinkeado.paciente.activo = true;
            }

            let pacienteAndesBase: any;
            if (pacienteBase.db === 'mpi') {
                pacienteAndesBase = new paciente(pacienteBase.paciente.toObject());
            } else {
                pacienteAndesBase = pacienteBase.paciente;
            }

            let pacienteAndesLinkeado: any;
            if (pacienteLinkeado.db === 'mpi') {
                pacienteAndesLinkeado = new paciente(pacienteLinkeado.paciente.toObject());
            } else {
                pacienteAndesLinkeado = pacienteLinkeado.paciente;
            }
            // sincronizamos los cambios en el paciente de elastic
            let connElastic = new ElasticSync();
            await connElastic.sync(pacienteAndesBase);
            await connElastic.sync(pacienteAndesLinkeado);

            Auth.audit(pacienteAndesLinkeado, req);
            await pacienteAndesLinkeado.save();
            Auth.audit(pacienteAndesBase, req);
            let pacienteSaved = await pacienteAndesBase.save();
            if (pacienteBase.db === 'mpi') {
                await controller.deletePacienteMpi(pacienteBase.paciente._id);
            }
            if (pacienteLinkeado.db === 'mpi') {
                await controller.deletePacienteMpi(pacienteLinkeado.paciente._id);
            }
            Logger.log(req, 'mpi', req.body.op, { pacienteBase: pacienteBase.paciente._id, pacienteLinkeado: pacienteLinkeado.paciente._id });
            res.json(pacienteSaved);
        } else {
            return next('Paciente no encontrado');
        }
    } catch (error) {
        return next(error);
    }
});

/**
 * @swagger
 * /pacientes/{id}:
 *   patch:
 *     tags:
 *       - Paciente
 *     description: Modificar ciertos datos de un paciente
 *     summary: Modificar ciertos datos de un paciente
 *     consumes:
 *       - application/json
 *     produces:
 *       - application/json
 *     parameters:
 *       - name: id
 *         in: path
 *         description: Id de un paciente
 *         required: true
 *         type: string
 *
 *     responses:
 *       200:
 *         description: Un objeto paciente
 *         schema:
 *           $ref: '#/definitions/paciente'
 */


router.patch('/pacientes/:id', async (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:patchAndes')) {
        return next(403);
    }
    try {
        let resultado = await controller.buscarPaciente(req.params.id);

        if (resultado) {
            switch (req.body.op) {
                case 'updateContactos':
                    controller.updateContactos(req, resultado.paciente);
                    resultado.paciente.markModified('contacto');
                    resultado.paciente.contacto = req.body.contacto;
                    break;
                case 'updateRelaciones':
                    controller.updateRelaciones(req, resultado.paciente);
                    break;
                case 'updateDireccion':
                    try {
                        await controller.updateDireccion(req, resultado.paciente);
                    } catch (err) { return next(err); }
                    break;
                case 'updateCarpetaEfectores':
                    try { // Actualizamos los turnos activos del paciente
                        const repetida = await controller.checkCarpeta(req, resultado.paciente);
                        if (!repetida) {
                            controller.updateCarpetaEfectores(req, resultado.paciente);
                            // controller.updateTurnosPaciente(resultado.paciente);
                        } else {
                            return next('El numero de carpeta ya existe');
                        }
                    } catch (error) { return next(error); }
                    break;
                case 'updateContactos': // Update de carpeta y de contactos
                    resultado.paciente.markModified('contacto');
                    resultado.paciente.contacto = req.body.contacto;
                    // try {
                    //     controller.updateTurnosPaciente(resultado.paciente);
                    // } catch (error) {
                    //     return next(error);
                    // }
                    break;

                case 'updateRelacion':
                    controller.updateRelacion(req, resultado.paciente);
                    break;
                case 'deleteRelacion':
                    controller.deleteRelacion(req, resultado.paciente);
                    break;
                case 'updateScan':
                    controller.updateScan(req, resultado.paciente);
                    break;
                case 'updateCuil':
                    controller.updateCuil(req, resultado.paciente);
                    break;
            }
            let pacienteAndes: any;
            if (resultado.db === 'mpi') {
                pacienteAndes = new paciente(resultado.paciente.toObject());
            } else {
                pacienteAndes = resultado.paciente;
            }
            // Quitamos esta sincronizacion con elastic para evitar la sincronización de campos no necesarios.
            // let connElastic = new ElasticSync();
            // await connElastic.sync(pacienteAndes);

            Auth.audit(pacienteAndes, req);
            let pacienteSaved = await pacienteAndes.save();
            res.json(pacienteSaved);
        } else {
            return next('Paciente no encontrado');
        }
    } catch (error) {
        return next(error);
    }

});

// Patch específico para actualizar masivamente MPI (NINGUN USUARIO DEBERIA TENER PERMISOS PARA ESTO)
router.patch('/pacientes/mpi/:id', (req, res, next) => {
    if (!Auth.check(req, 'mpi:paciente:patchMpi')) {
        return next(403);
    }
    controller.buscarPaciente(req.params.id).then((resultado) => {
        if (resultado) {
            switch (req.body.op) {
                case 'updateCuil':
                    controller.updateCuil(req, resultado.paciente);
                    break;
            }
            let pacMpi: any;
            if (resultado.db === 'mpi') {
                pacMpi = new pacienteMpi(resultado.paciente);
                Auth.audit(pacMpi, req);

                pacMpi.save((errPatch) => {
                    if (errPatch) {
                        return next(errPatch);
                    }
                    return res.json(pacienteMpi);
                });
            } else {
                return res.json({});
            }
        } else {
            return next(500);
        }

    })
        .catch((err) => {
            return next(err);
        });
});


export = router;
