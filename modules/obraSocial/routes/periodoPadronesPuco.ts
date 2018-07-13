import * as express from 'express';
import { periodoPadronesPuco } from '../schemas/periodoPadronesPuco';

let router = express.Router();

/**
 * Obtiene los datos de la obra social asociada a un paciente
 *
 * @param {any} id
 * @returns
 */
router.get('/periodoPadronesPuco/:id*?', function (req, res, next) {
    if (req.params.id) {
        periodoPadronesPuco.findById(req.params.id, function (err, data) {
            if (err) {
                return next(err);
            }
            res.json(data);
        });
    } else {
        if (req.query.desde) {
            periodoPadronesPuco.find({ version: { $gte: req.query.desde } }, function (err, data) {
                if (err) {
                    return next(err);
                }
                res.json(data);
            });
        } else {
            res.status(400).json({ msg: 'Parámetros incorrectos' });
        }
    }
});

module.exports = router;
