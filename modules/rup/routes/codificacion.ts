
import * as express from 'express';
import * as mongoose from 'mongoose';
import { codificacion } from '../schemas/codificacion';
import * as prestacion from '../schemas/prestacion';
import * as codificacionController from '../controllers/codificacionController';
import { Auth } from './../../../auth/auth.class';
import { toArray } from '../../../utils/utils';
import { stringify } from 'querystring';


const router = express.Router();

router.post('/codificacion', async (req, res, next) => {
    const idPrestacion = req.body.idPrestacion;
    const unaPrestacion = await prestacion.model.findById(idPrestacion);
    const codificaciones = await codificacionController.codificarPrestacion(unaPrestacion);
    let data = new codificacion({
        idPrestacion,
        paciente: (unaPrestacion as any).paciente,
        diagnostico: {
            codificaciones
        }
    });

    Auth.audit(data, req);
    data.save((err) => {
        if (err) {
            return next(err);
        }
        res.json(data);
    });
});

router.patch('/codificacion/:id', async (req, res, next) => {
    const unaCodificacion = await codificacion.findById(req.params.id);
    (unaCodificacion as any).diagnostico.codificaciones = req.body.codificaciones;
    let data = new codificacion(unaCodificacion);
    Auth.audit(data, req);
    data.save((err) => {
        if (err) {
            return next(err);
        }
        res.json(data);
    });
});


router.get('/codificacion/:id?', async (req: any, res, next) => {
    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        const unaCodificacion = await codificacion.findById(req.params.id);
        res.json(unaCodificacion);
    } else {
<<<<<<< HEAD
        let filtros = {
            'createdBy.organizacion.id': req.user.organizacion.id,
            createdAt: {
                $gte: new Date(req.query.fechaDesde),
                $lte: new Date(req.query.fechaHasta),
            },
        };

        if (!req.query.auditadas) {
            filtros['diagnostico.codificaciones.codificacionAuditoria.codigo'] = { $exists: req.query.auditadas };
        }

        let pipeline = [
            {
                $match: filtros
            },
            {
                $lookup: {
                    from: 'prestaciones',
                    localField: 'idPrestacion',
                    foreignField: '_id',
                    as: 'prestacion'
=======
        let query = codificacion.find({});
        if (req.query.fechaDesde) {
            query.where('createdAt').gte(req.query.fechaDesde);
        }
        if (req.query.fechaHasta) {
            query.where('createdAt').lte(req.query.fechaHasta);
        }
        if (req.query.auditadas === false) {
            query.where('diagnostico.codificaciones.codificacionAuditoria.codigo').exists(false);
        }

        query.exec(async (err, data: any) => {
            if (err) {
                return next(err);
            }
            const cantidad = data.length;
            if (cantidad > 0) {
                for (let i = 0; i < cantidad; i++) {
                    let objeto = data[i];
                    let unaPrestacion = await prestacion.model.findById(data[i].idPrestacion);
                    objeto.prestacion = (unaPrestacion as any).solicitud.tipoPrestacion ? (unaPrestacion as any).solicitud.tipoPrestacion.term : null;
                    data[i] = objeto;
>>>>>>> master
                }
            },
            { $unwind: '$prestacion' },
            {
                $project:
                {
                    diagnostico: 1,
                    idPrestacion: 1,
                    paciente: 1,
                    createdAt: 1,
                    createdBy: 1,
                    updatedAt: 1,
                    updatedBy: 1,
                    prestacion: '$prestacion.solicitud.tipoPrestacion.term'
                }
            }];
        try {
            const data = await toArray(codificacion.aggregate(pipeline).cursor({}).exec());
            res.json(data);
        } catch (err) {
            return next(err);
        }
    }
});


export = router;
