import * as express from 'express';
import * as mongoose from 'mongoose';
import * as config from '../../../config';
import * as configPrivate from '../../../config.private';
import * as moment from 'moment';
import * as utils from '../../../utils/utils';
import * as parser from '../controller/parser';
import {
    Matching
} from '@andes/match';
import {
    Client
} from 'elasticsearch';
import {
    Auth
} from './../../../auth/auth.class';

let router = express.Router();

// Schemas
import {
    pacienteMpi
} from '../../../core/mpi/schemas/paciente';

router.get('/([\$])match', function(req, res, next){
    // Verificación de permisos
    // if (!Auth.check(req, 'fhir:pacient:match')) {
    //     return next(403);
    // }
    let connElastic = new Client({
        host: configPrivate.hosts.elastic_main,
    });

    let query;
    let consulta;
    
    req.query.identifier ? consulta = req.query.identifier : '';
    req.query.family ? consulta ? consulta = consulta + ' ' + req.query.family : consulta = req.query.family : '';
    req.query.given ?  consulta ? consulta = consulta + ' ' + req.query.given : consulta = req.query.given : '';

    // Traigo todos los pacientes
    if (!consulta) {
        query = {
            match_all: {}
        };
    } else {
        query = {
            multi_match: {
                query: consulta,
                type: 'cross_fields',
                fields: ['documento^5', 'nombre', 'apellido^3'],
            }
        };
    }

    // Configuramos la cantidad de resultados que quiero que se devuelva y la query correspondiente
    let body = {
        size: 3000,
        from: 0,
        query: query
    };

    connElastic.search({
            index: 'andes',
            body: body
        })
        .then((searchResult) => {
            let idPacientes: Array < any > = ((searchResult.hits || {}).hits || [])
                .map((hit) => {
                    let elem = hit._source;
                    elem['id'] = hit._id;
                    return elem.id;
                });

            let pacienteFhir = parser.pacientesAFHIR(idPacientes).then( datosFhir => {
                res.send(datosFhir);
            });
        })
        .catch((error) => {
            next(error);
        });
});

router.post('/', async function (req, res, next) {
    let l = await parser.FHIRAPaciente(req.body);
    console.log('ll ', l);

    //     let data = new agenda(req.body);
    //     Auth.audit(data, req);
    //     data.save((err) => {
    //         Logger.log(req, 'turnos', 'insert', {
    //             accion: 'Crear Agenda',
    //             ruta: req.url,
    //             method: req.method,
    //             data: data,
    //             err: err || false
    //         });
    //         if (err) {
    //             return next(err);
    //         }
    //         res.json(data);
    //     });
});

export = router;
