import * as express from 'express';
import { model as Organizacion } from '../../../../core/tm/schemas/organizacion';
import { model as Prestacion } from '../../../../modules/rup/schemas/prestacion';

import { getUltimoNumeroProtocolo, getResultadosAnteriores, getEjecucionesCobasC311, enviarAutoanalizador } from '../controller/protocolo';
import { Auth } from '../../../../auth/auth.class';
import { Types } from 'mongoose';


let router = express.Router();

router.get('/protocolo/generarNumero/', async (req, res, next) => {
    let idEfector = Types.ObjectId(req.query.idEfector);
    let ultimoNumeroProtocolo = await getUltimoNumeroProtocolo(idEfector);
    let anio = new Date().getFullYear().toString().substr(-2);
    let prefijo;
    try {
        Organizacion.findOne(idEfector).then((organizacion: any) => {
            prefijo = organizacion.prefijo;
            ultimoNumeroProtocolo++;
            let nuevoNumeroProtocolo = {
                numeroCompleto: ultimoNumeroProtocolo + '-' + prefijo + anio,
                numero: ultimoNumeroProtocolo
            };
            res.json(nuevoNumeroProtocolo);
        });
    } catch (e) {
        res.json(e);
    }
});

router.get('/practicas/resultadosAnteriores', async (req, res, next) => {
    let idPaciente = Types.ObjectId(req.query.idPaciente);
    let practicaConceptIds = Array.isArray(req.query.practicaConceptIds) ? req.query.practicaConceptIds : [req.query.practicaConceptIds];
    let resultadosAnteriores = await getResultadosAnteriores(idPaciente, practicaConceptIds);

    res.json(resultadosAnteriores);
});

router.get('/protocolo/cobasc311', async (req, res, next) => {
    // if (!Auth.check(req, 'laboratorio:analizador:*')) {
    //     return next(403);
    // }
    let practicasCobas = await getEjecucionesCobasC311();
    res.json(practicasCobas);
});

router.get('/protocolo/cobasc311/:id', async (req, res, next) => {
    Prestacion.findById(req.params.id, (err, data: any) => {
        if (err) {
            return next(err);
        }
        if (data) {
            res.json(data);
        }
    });
});

router.patch('/practicas/cobasc311/:id', async (req, res, next) => {
    // console.log('req.params:', req.params);
    // console.log('req.body:', req.body);
    // console.log('req.body._id:', req.body._id);

    try {
        Prestacion.updateOne(
            {
                _id: req.params.id,
                'ejecucion.registros.concepto.conceptId': req.body.conceptId
            },
            {
                $set: {
                    'ejecucion.registros.$.valor.resultado.valor': req.body.valor
                }
            },
            (err, data: any) => {
                if (err) {
                    console.log('eror1:', err);
                    return next(err);
                }
                Auth.audit(data, req);
                console.log('data.ejecucion.registros:', data);
                return res.json(data);
            }
        );
    } catch (error) {
        console.log('error Prestacion.updateOne:', error);
    }
});

router.post('/protocolo/autoanalizador', async (req, res, next) => {
    let numeroProtocolo = req.query.numeroProtocolo;
    enviarAutoanalizador(numeroProtocolo);
    res.json({});
});


router.get('/protocolo/numero/:numero', async (req, res, next) => {
    if (req.params.numero) {
        Prestacion.find({ 'solicitud.registros.valor.solicitudPrestacion.numeroProtocolo.numeroCompleto': req.params.numero }).exec((err, data) => {
            if (err) {
                return next(err);
            }
            if (req.params.id && !data) {
                return next(404);
            }
            res.json(data);
        });
    }
    // res.json(req);
});

export = router;
