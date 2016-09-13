"use strict";
var express = require('express');
var profesional = require('../schemas/profesional');
var router = express.Router();
router.get('/profesional/:_id*?', function (req, res, next) {
    if (req.params.id) {
        profesional.findById(req.params._id, function (err, data) {
            if (err) {
                next(err);
            }
            ;
            res.json(data);
        });
    }
    else {
        var query;
        query = profesional.find({ habilitado: true }); //Trae todos 
        if (req.query.apellido)
            query.where('apellido').equals(RegExp('^.*' + req.query.apellido + '.*$', "i"));
        if (req.query.nombre) {
            query.where('nombre').equals(RegExp('^.*' + req.query.nombre + '.*$', "i"));
        }
        query.exec(function (err, data) {
            if (err)
                return next(err);
            res.json(data);
        });
    }
});
router.post('/profesional', function (req, res, next) {
    var newProfesional = new profesional(req.body);
    newProfesional.save(function (err) {
        if (err) {
            next(err);
        }
        res.json(newProfesional);
    });
});
router.put('/profesional/:_id', function (req, res, next) {
    profesional.findByIdAndUpdate(req.params._id, req.body, function (err, data) {
        if (err)
            return next(err);
        res.json(data);
    });
});
router.delete('/profesional/:_id', function (req, res, next) {
    profesional.findByIdAndRemove(req.params._id, req.body, function (err, data) {
        if (err)
            return next(err);
        res.json(data);
    });
});
module.exports = router;
//# sourceMappingURL=profesional.js.map