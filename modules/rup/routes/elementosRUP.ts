import * as express from 'express';
import * as mongoose from 'mongoose';
import { defaultLimit, maxLimit } from './../../../config';
import { elementoRUP } from '../schemas/elementoRUP';
import { SnomedCtr } from '../../../core/term/controller/snomed.controller';

const router = express.Router();

/**
 * Devueve los grupos sugeridos en la busqueda guiada por prestación.
 */

router.get('/elementosRUP/:id/guiada', async (req, res, next) => {
    const prestacion = req.params.id;
    const elemento: any = await elementoRUP.findOne({ 'conceptos.conceptId': prestacion });

    if (elemento && elemento.busqueda_guiada && elemento.busqueda_guiada.length > 0) {

        let flag = false;
        for (const guia of elemento.busqueda_guiada) {
            if (!guia.conceptIds.length) {
                flag = true;
                guia.conceptIds = await SnomedCtr.getConceptByExpression(guia.query);
                guia.conceptIds = guia.conceptIds.map(c => c.conceptId);
            }
        }

        res.json(elemento.busqueda_guiada);
        if (flag) {
            elemento.save();
        }

    } else {
        res.json([]);
    }

});


router.get('/elementosRUP/:id*?', (req, res, next) => {
    let query: mongoose.DocumentQuery<any, mongoose.Document>;
    if (req.params.id) {
        query = elementoRUP.findById(req.params.id);
    } else {
        query = elementoRUP.find({}); // Trae todos
        if (req.query.skip) {
            const skip: number = parseInt(req.query.skip || 0, 10);
            query = query.skip(skip);
        }
        if (req.query.limit) {
            const limit: number = Math.min(parseInt(req.query.limit || defaultLimit, 10), maxLimit);
            query = query.limit(limit);
        }
        if (req.query.nombre) {
            query.where('nombre').equals(RegExp('^.*' + req.query.nombre + '.*$', 'i'));
        }
        if (req.query.key) {
            query.where('key').equals(RegExp('^.*' + req.query.key + '.*$', 'i'));
        }
        if (req.query.excluir) {
            const ids = req.query.excluir.split(',');
            query.where('_id').nin(ids);
        }
        if (req.query.incluir) {
            const idsIn = req.query.incluir.split(',');
            query.where('_id').in(idsIn);
        }
        if (req.query.granularidad) {
            query.where('tipo').equals(req.query.tipo);
        }
        query.where('activo').equals(true);
    }

    // query.populate('requeridos.elementoRUP');
    query.sort({ nombre: 1 }).exec((err, data) => {
        if (err) {
            return next(err);
        }
        res.json(data);
    });
});


export = router;
