import * as express from 'express';
import { generarNumeroLoteDerivacion } from './../controller/loteDerivacion';
import { actualizarEstadoDerivadoRegistrosEjecucion } from './../controller/protocolo';
import { LoteDerivacion } from './../schemas/loteDerivacion';
import { Auth } from '../../../../auth/auth.class';
import { Types } from 'mongoose';

let router = express.Router();

router.get('/lotesDerivaciones/', async (req, res, next) => {
    try {
        let query: any = {};
        if (req.query.numeroLote) {
            query['numeroLote'] = req.query.numeroLote;
        }
        if (req.query.fecha) {
            query['fecha'] = req.query.fecha;
        }
        if (req.query.laboratorioOrigen) {
            query['laboratorioOrigen.id'] = Types.ObjectId(req.query.laboratorioOrigen);
        }
        if (req.query.laboratorioDestino) {
            query['laboratorioDestino.id'] = Types.ObjectId(req.query.laboratorioDestino);
        }
        if (req.query.estado) {
            query['estado'] = req.query.estado;
        }
        res.json(await LoteDerivacion.find(query).exec());
    } catch (e) {
        res.json(e);
    }
});

router.post('/lotesDerivaciones/', async (req, res, next) => {
    let lote: any = new LoteDerivacion(req.body);
    lote.numero = generarNumeroLoteDerivacion();
    lote.fecha = new Date();
    Auth.audit(lote, req);
    lote.save( async (err, data) => {
        if (err) {
            return next(err);
        }
        await actualizarEstadoDerivadoRegistrosEjecucion(data.registrosPracticas.map( r => { return r._id; } ), data.createdBy, data.laboratorioDestino);
        res.json(data);
    });
});
export = router;